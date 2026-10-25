import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import nodePath, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
/* eslint-disable security/detect-non-literal-fs-filename -- repository writes and stats generated files only inside destination output directories. */

import createDebug from "debug";
import ts from "typescript";

import {
  formatStatements,
  importDeclaration,
  parameter,
  typeReference,
  withJsDoc,
} from "./ast.js";

import { ensureDirectoryExists } from "./ensure-directory-exists.js";
import {
  toForwardSlashPath,
  pathRelative,
  pathDirname,
} from "./forward-slash-path.js";
import { Script } from "./script.js";
import { escapePathForWindows } from "./windows-escape.js";

const debug = createDebug("counterfact:server:repository");

const __dirname = toForwardSlashPath(dirname(fileURLToPath(import.meta.url)));

debug("dirname is %s", __dirname);

function assertSafeRepositoryPath(path: string): void {
  const segments = path.split("/");

  if (
    path === "" ||
    path.includes("\0") ||
    path.includes("\\") ||
    nodePath.posix.isAbsolute(path) ||
    nodePath.win32.isAbsolute(path) ||
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    throw new Error(
      `Repository path ${JSON.stringify(path)} must be a safe, relative, forward-slash path.`,
    );
  }
}

function resolveDestinationPath(destination: string, path: string): string {
  const destinationRoot = nodePath.resolve(destination);
  const candidatePath = nodePath.resolve(destinationRoot, path);
  const relativePath = nodePath.relative(destinationRoot, candidatePath);

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${nodePath.sep}`) ||
    nodePath.isAbsolute(relativePath)
  ) {
    throw new Error(
      `Repository path ${JSON.stringify(path)} escapes destination ${JSON.stringify(destinationRoot)}.`,
    );
  }

  assertSafeRepositoryPath(path);

  return escapePathForWindows(candidatePath);
}

interface WriteFilesOptions {
  routes?: boolean;
  types?: boolean;
}

/**
 * Collection of {@link Script} objects keyed by their repository-relative
 * path.
 *
 * Coders call {@link get} to obtain (or create) the script where they should
 * export their generated TypeScript.  After all coders have been registered,
 * {@link writeFiles} waits for every script to finish and writes the output to
 * disk.
 */
export class Repository {
  public scripts: Map<string, Script>;

  public constructor() {
    this.scripts = new Map();
  }

  /**
   * Returns the {@link Script} for `path`, creating it if it does not yet
   * exist.
   *
   * @param path - Repository-relative path (e.g. `"routes/pets.ts"`).
   */
  public get(path: string): Script {
    debug("getting script at %s", path);

    assertSafeRepositoryPath(path);

    if (this.scripts.has(path)) {
      debug("already have script %s, returning it", path);

      return this.scripts.get(path)!;
    }

    debug("don't have %s, creating it", path);

    const script = new Script(this, path);

    this.scripts.set(path, script);

    return script;
  }

  /** Waits until all scripts have resolved all of their pending export promises. */
  public async finished(): Promise<void> {
    while (
      Array.from(this.scripts.values()).some((script) => script.isInProgress())
    ) {
      debug("waiting for %i scripts to finish", this.scripts.size);

      await Promise.all(
        Array.from(this.scripts.values(), (script) => script.finished()),
      );
    }
  }

  /**
   * Copies the compiled `counterfact-types` directory from the Counterfact
   * distribution into the generated output tree.
   *
   * Returns `false` when the source directory does not exist (e.g. running
   * from source without a prior build).
   *
   * @param destination - The root of the generated output tree.
   */
  public async copyCoreFiles(destination: string): Promise<boolean | void> {
    const installedTemplatePath = nodePath.join(
      __dirname,
      "templates",
      "counterfact-types",
    );
    const sourceTemplatePath = nodePath.join(
      __dirname,
      "..",
      "dist",
      "templates",
      "counterfact-types",
    );
    const sourcePath = existsSync(installedTemplatePath)
      ? installedTemplatePath
      : sourceTemplatePath;
    const destinationPath = nodePath.join(destination, "counterfact-types");

    if (!existsSync(sourcePath)) {
      return false;
    }

    return fs.cp(sourcePath, destinationPath, { recursive: true });
  }

  /**
   * Waits for all scripts to finish, then writes each one to disk.
   *
   * Route files (`routes/…`) are never fully overwritten if they already exist
   * on disk, preserving user edits.  However, if the generated script contains
   * HTTP-method handler exports that are absent from the existing file, those
   * new exports (and their `import type` statements) are appended to the file.
   * Type files (`types/…`) are always overwritten.
   *
   * @param destination - Absolute path to the output root directory.
   * @param options - Controls which artefacts are written.
   */
  public async writeFiles(
    destination: string,
    { routes, types }: WriteFilesOptions,
  ): Promise<void> {
    debug(
      "waiting for %i or more scripts to finish before writing files",
      this.scripts.size,
    );
    await this.finished();
    debug("all %i scripts are finished", this.scripts.size);

    const writeFiles = Array.from(
      this.scripts.entries(),

      async ([path, script]) => {
        const fullPath = resolveDestinationPath(destination, path);
        const contents = await script.contents(
          this.findContextPath(destination, path),
        );

        await ensureDirectoryExists(fullPath);

        const shouldWriteRoutes = routes && path.startsWith("routes");
        const shouldWriteTypes = types && !path.startsWith("routes");

        if (shouldWriteRoutes) {
          const fileExists = await fs
            .stat(fullPath)
            .then((stat) => stat.isFile())
            .catch(() => false);

          if (fileExists) {
            debug(`route file exists, checking for new handlers: ${fullPath}`);
            await this.appendNewHandlers(fullPath, script);

            return;
          }
        }

        if (shouldWriteRoutes || shouldWriteTypes) {
          debug("about to write", fullPath);
          await fs.writeFile(fullPath, contents);
          debug("did write", fullPath);
        }
      },
    );

    await Promise.all(writeFiles);

    await this.copyCoreFiles(destination);

    if (routes) {
      await this.createDefaultContextFile(destination);
    }
  }

  /**
   * Creates the default `routes/_.context.ts` file if it does not already
   * exist.
   *
   * @param destination - Absolute path to the output root directory.
   */
  public async createDefaultContextFile(destination: string): Promise<void> {
    const contextFilePath = nodePath.join(
      destination,
      "routes",
      "_.context.ts",
    );

    if (existsSync(contextFilePath)) {
      return;
    }

    await ensureDirectoryExists(contextFilePath);

    const context = withJsDoc(
      ts.factory.createClassDeclaration(
        [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
        "Context",
        undefined,
        undefined,
        [
          ts.factory.createConstructorDeclaration(
            undefined,
            [parameter("$", typeReference("Context$"))],
            ts.factory.createBlock(
              [
                ts.factory.createExpressionStatement(
                  ts.factory.createVoidExpression(
                    ts.factory.createIdentifier("$"),
                  ),
                ),
              ],
              true,
            ),
          ),
        ],
      ),
      {
        description:
          "This is the default context for Counterfact.\n\n" +
          "It defines the context object in the REPL\nand the $.context object in the code.\n\n" +
          "Add properties and methods to suit your needs.\n\n" +
          "See https://github.com/counterfact/api-simulator/blob/main/docs/features/state.md",
      },
    );
    await fs.writeFile(
      contextFilePath,
      await formatStatements([
        importDeclaration("Context$", "../types/_.context.js", true),
        context,
      ]),
    );
  }

  /**
   * Inserts newly generated handlers and their type imports without reprinting
   * existing user code. Only the existing file is parsed; generated declarations
   * are taken directly from the Script's AST.
   */
  private async appendNewHandlers(
    fullPath: string,
    script: Script,
  ): Promise<void> {
    const existing = await fs.readFile(fullPath, "utf8");
    const source = ts.createSourceFile(
      fullPath,
      existing,
      ts.ScriptTarget.Latest,
      true,
    );
    const exported = new Set<string>();
    const bindings = new Set<string>();
    const valueBindings = new Set<string>();
    const imports = new Map<string, { module: string; exported: string }>();
    let lastImport: ts.ImportDeclaration | undefined;

    const collectBinding = (name: ts.BindingName): void => {
      if (ts.isIdentifier(name)) {
        bindings.add(name.text);
        valueBindings.add(name.text);
      } else
        for (const element of name.elements) {
          if (ts.isBindingElement(element)) collectBinding(element.name);
        }
    };

    for (const statement of source.statements) {
      const isExported =
        ts.canHaveModifiers(statement) &&
        ts
          .getModifiers(statement)
          ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          collectBinding(declaration.name);
          if (isExported && ts.isIdentifier(declaration.name))
            exported.add(declaration.name.text);
        }
      } else if (
        (ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement) ||
          ts.isEnumDeclaration(statement) ||
          ts.isTypeAliasDeclaration(statement) ||
          ts.isInterfaceDeclaration(statement)) &&
        statement.name
      ) {
        bindings.add(statement.name.text);
        if (
          !ts.isTypeAliasDeclaration(statement) &&
          !ts.isInterfaceDeclaration(statement)
        ) {
          valueBindings.add(statement.name.text);
          if (isExported) exported.add(statement.name.text);
        }
      } else if (ts.isExportDeclaration(statement)) {
        if (statement.isTypeOnly) continue;
        // Resolve aliases and re-exports using TypeScript's value namespace,
        // without loading or executing any user-authored JavaScript.
        const program = ts.createProgram([fullPath], {
          allowJs: true,
          noLib: true,
          types: [],
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
        });
        const checker = program.getTypeChecker();
        const moduleSource = program.getSourceFile(fullPath)!;
        const hasValue = (symbol: ts.Symbol | undefined): boolean => {
          if (!symbol) return false;
          if (symbol.flags & ts.SymbolFlags.Alias) {
            if (
              symbol.declarations?.some(
                (declaration) =>
                  (ts.isExportSpecifier(declaration) &&
                    (declaration.isTypeOnly ||
                      declaration.parent.parent.isTypeOnly)) ||
                  (ts.isImportSpecifier(declaration) &&
                    (declaration.isTypeOnly ||
                      declaration.parent.parent.isTypeOnly)),
              )
            )
              return false;
            return hasValue(checker.getAliasedSymbol(symbol));
          }
          return (symbol.flags & ts.SymbolFlags.Value) !== 0;
        };
        const item = moduleSource.statements.find(
          (candidate) => candidate.pos === statement.pos,
        )!;
        if (ts.isExportDeclaration(item)) {
          if (item.exportClause && ts.isNamedExports(item.exportClause)) {
            for (const element of item.exportClause.elements)
              if (
                !element.isTypeOnly &&
                hasValue(checker.getSymbolAtLocation(element.name))
              )
                exported.add(element.name.text);
          } else if (
            item.exportClause &&
            ts.isNamespaceExport(item.exportClause)
          ) {
            if (hasValue(checker.getSymbolAtLocation(item.exportClause.name)))
              exported.add(item.exportClause.name.text);
          } else if (item.moduleSpecifier) {
            const symbol = checker.getSymbolAtLocation(item.moduleSpecifier);
            if (!symbol)
              throw new Error(
                "Cannot resolve a star re-export while updating " + fullPath,
              );
            for (const entry of checker.getExportsOfModule(symbol))
              if (entry.name !== "default" && hasValue(entry))
                exported.add(entry.name);
          }
        }
      }
      if (ts.isImportDeclaration(statement)) {
        lastImport = statement;
        if (statement.importClause?.name) {
          bindings.add(statement.importClause.name.text);
          if (!statement.importClause.isTypeOnly)
            valueBindings.add(statement.importClause.name.text);
        }
        const named = statement.importClause?.namedBindings;
        if (named && ts.isNamespaceImport(named)) {
          bindings.add(named.name.text);
          if (!statement.importClause?.isTypeOnly)
            valueBindings.add(named.name.text);
        } else if (named && ts.isStringLiteral(statement.moduleSpecifier)) {
          for (const element of named.elements) {
            bindings.add(element.name.text);
            if (!statement.importClause?.isTypeOnly && !element.isTypeOnly)
              valueBindings.add(element.name.text);
            imports.set(element.name.text, {
              module: statement.moduleSpecifier.text,
              exported: element.propertyName?.text ?? element.name.text,
            });
          }
        }
      }
    }

    const newImports: ts.ImportDeclaration[] = [];
    const handlers: ts.Statement[] = [];
    const generatedImports = script.importStatements();
    for (const statement of script.exportStatements()) {
      if (!ts.isVariableStatement(statement)) continue;
      const declaration = statement.declarationList.declarations[0];
      if (
        !declaration ||
        !ts.isIdentifier(declaration.name) ||
        exported.has(declaration.name.text)
      )
        continue;
      if (valueBindings.has(declaration.name.text))
        throw new Error(
          "Cannot add handler " +
            declaration.name.text +
            ": a local binding already exists in " +
            fullPath,
        );
      if (
        !declaration.type ||
        !ts.isTypeReferenceNode(declaration.type) ||
        !ts.isIdentifier(declaration.type.typeName)
      ) {
        throw new Error(
          "Generated handler lacks a named type: " + declaration.name.text,
        );
      }
      let localType = declaration.type.typeName.text;
      const originalType = localType;
      const imported = generatedImports.flatMap((item) => {
        const named = item.importClause?.namedBindings;
        return named && ts.isNamedImports(named)
          ? named.elements
              .filter((element) => element.name.text === originalType)
              .map((element) => ({ item, element }))
          : [];
      })[0];
      if (!imported || !ts.isStringLiteral(imported.item.moduleSpecifier))
        throw new Error(
          "Cannot find handler type import for " + declaration.name.text,
        );
      const module = imported.item.moduleSpecifier.text;
      const exportedType =
        imported.element.propertyName?.text ?? imported.element.name.text;
      const existingImport = imports.get(localType);
      if (
        !existingImport ||
        existingImport.module !== module ||
        existingImport.exported !== exportedType
      ) {
        let suffix = 2;
        while (bindings.has(localType)) localType = originalType + suffix++;
        newImports.push(
          importDeclaration(localType, module, true, false, exportedType),
        );
        imports.set(localType, { module, exported: exportedType });
        bindings.add(localType);
      }
      handlers.push(
        ts.factory.updateVariableStatement(
          statement,
          statement.modifiers,
          ts.factory.updateVariableDeclarationList(statement.declarationList, [
            ts.factory.updateVariableDeclaration(
              declaration,
              declaration.name,
              declaration.exclamationToken,
              typeReference(localType),
              declaration.initializer,
            ),
          ]),
        ),
      );
      exported.add(declaration.name.text);
      bindings.add(declaration.name.text);
      valueBindings.add(declaration.name.text);
    }
    if (handlers.length === 0) return;

    // Include complete trailing comments before inserting after an import.
    const afterLine = (position: number): number => {
      const scanner = ts.createScanner(
        ts.ScriptTarget.Latest,
        false,
        ts.LanguageVariant.Standard,
        existing,
      );
      scanner.setTextPos(position);
      let end = position;
      for (
        let token = scanner.scan();
        token !== ts.SyntaxKind.EndOfFileToken;
        token = scanner.scan()
      ) {
        if (token === ts.SyntaxKind.NewLineTrivia) return scanner.getTextPos();
        if (
          token !== ts.SyntaxKind.WhitespaceTrivia &&
          token !== ts.SyntaxKind.SingleLineCommentTrivia &&
          token !== ts.SyntaxKind.MultiLineCommentTrivia
        )
          break;
        end = scanner.getTextPos();
      }
      return end;
    };
    let insertAt = lastImport ? afterLine(lastImport.end) : 0;
    if (!lastImport) {
      const references = [
        ...source.referencedFiles,
        ...source.typeReferenceDirectives,
        ...source.libReferenceDirectives,
      ];
      const scanner = ts.createScanner(
        ts.ScriptTarget.Latest,
        false,
        ts.LanguageVariant.Standard,
        existing,
      );
      const trivia = new Set([
        ts.SyntaxKind.WhitespaceTrivia,
        ts.SyntaxKind.NewLineTrivia,
        ts.SyntaxKind.SingleLineCommentTrivia,
        ts.SyntaxKind.MultiLineCommentTrivia,
        ts.SyntaxKind.ShebangTrivia,
        ts.SyntaxKind.ConflictMarkerTrivia,
      ]);
      for (
        let token = scanner.scan();
        trivia.has(token);
        token = scanner.scan()
      ) {
        const start = scanner.getTokenPos();
        const end = scanner.getTextPos();
        if (
          token === ts.SyntaxKind.ShebangTrivia ||
          references.some(
            (reference) => start <= reference.pos && end >= reference.end,
          )
        )
          insertAt = afterLine(end);
      }
    }
    let updated = existing;
    if (newImports.length > 0) {
      const prefix = existing.slice(0, insertAt);
      updated =
        prefix +
        (prefix !== "" && !prefix.endsWith("\n") ? "\n" : "") +
        (await formatStatements(newImports)) +
        existing.slice(insertAt);
    }
    updated +=
      (updated.endsWith("\n") ? "\n" : "\n\n") +
      (await formatStatements(handlers));
    await fs.writeFile(fullPath, updated);
  }

  /**
   * Returns the path of the `_.context.ts` file that is nearest to `path` in
   * the directory hierarchy, relative to the script's output directory.
   *
   * @param destination - Output root directory.
   * @param path - Repository-relative path of the script being generated.
   */
  public findContextPath(destination: string, path: string): string {
    return pathRelative(
      nodePath.join(destination, nodePath.dirname(path)),
      this.nearestContextFile(destination, path),
    );
  }

  /**
   * Walks up the directory tree from `path` to find the nearest
   * `_.context.ts` file, falling back to `routes/_.context.ts` at the root.
   *
   * @param destination - Output root directory.
   * @param path - Repository-relative path to start from.
   */
  public nearestContextFile(destination: string, path: string): string {
    const directory = pathDirname(path).replace("types/paths", "routes");

    const candidate = nodePath.join(destination, directory, "_.context.ts");

    if (directory.length <= 1) {
      // No _context.ts was found so import the one that should be in the root
      return nodePath.join(destination, "routes", "_.context.ts");
    }

    if (existsSync(candidate)) {
      return candidate;
    }

    return this.nearestContextFile(destination, nodePath.join(path, ".."));
  }
}
