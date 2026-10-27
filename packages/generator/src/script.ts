import createDebugger from "debug";
import ts from "typescript";

import {
  formatStatements,
  importDeclaration,
  objectExpression,
  typeAlias,
  typeLiteral,
  typeProperty,
  unknownType,
  withComment,
} from "./ast.js";
import { escapePathForWindows } from "./windows-escape.js";
import { pathJoin, pathRelative, pathDirname } from "./forward-slash-path.js";
import { SchemaTypeTransformError } from "./schema-type-transform.js";
import type { Coder, ExportStatement } from "./coder.js";
import type { Repository } from "./repository.js";

const debug = createDebugger("counterfact:typescript-generator:script");

interface ImportEntry {
  id: string;
  isDefault: boolean;
  isType: boolean;
  name: string;
  script: Script;
}

export type ModuleReference = string | { context: true };

interface ExternalImportEntry {
  isDefault?: boolean;
  isType: boolean;
  modulePath: ModuleReference;
}

/** One generated module: coders register nodes; printing occurs after resolution. */
export class Script {
  public repository: Repository;
  public comments: string[] = [];
  public exports = new Map<string, ExportStatement>();
  public versions = new Map<string, Map<string, ExportStatement>>();
  public versionBuilders = new Map<
    string,
    (versions: Map<string, ts.TypeNode>) => ts.Statement[]
  >();
  public imports = new Map<string, ImportEntry>();
  public externalImport = new Map<string, ExternalImportEntry>();
  public cache = new Map<string, string>();
  private readonly schemaImports = new Map<
    string,
    { module: string; exported: string; local: string }
  >();

  public constructor(
    repository: Repository,
    public path: string,
  ) {
    this.repository = repository;
  }

  public get relativePathToBase(): string {
    return this.path
      .split("/")
      .slice(0, -1)
      .map(() => "..")
      .join("/");
  }

  public firstUniqueName(
    coder: Coder,
    isType = false,
    isDefault = false,
  ): string {
    for (const name of coder.names()) {
      if (
        (!this.imports.has(name) ||
          (this.imports.get(name)!.id === coder.exportId &&
            this.imports.get(name)!.isType === isType &&
            this.imports.get(name)!.isDefault === isDefault)) &&
        (!this.exports.has(name) ||
          (this.exports.get(name)!.id === coder.exportId &&
            this.exports.get(name)!.isType === isType &&
            this.exports.get(name)!.isDefault === isDefault)) &&
        !this.externalImport.has(name) &&
        ![...this.schemaImports.values()].some((entry) => entry.local === name)
      )
        return name;
    }
    throw new Error(`could not find a unique name for ${coder.id}`);
  }

  public export(coder: Coder, isType = false, isDefault = false): string {
    const cacheKey = isDefault ? "default" : `${coder.id}:${isType}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;
    const name = this.firstUniqueName(coder, isType, isDefault);
    this.cache.set(cacheKey, name);

    const entry: ExportStatement = {
      done: false,
      id: coder.exportId,
      isDefault,
      isType,
      name,
      jsdoc: "",
      typeDeclaration: coder.typeDeclaration(this.exports, this),
    };
    this.exports.set(name, entry);
    entry.promise = coder
      .delegate()
      .then((available) => {
        entry.statements = available.exportDeclarations(this, name);
        if (entry.statements === undefined) entry.node = available.write(this);
        entry.jsdoc = available.jsdoc();
        return available;
      })
      .catch((error: Error) => {
        entry.node = isType ? unknownType() : objectExpression([]);
        entry.jsdoc = `/** error creating export "${name}" for ${this.path}: ${error.stack} */`;
        entry.error = error;
        return undefined;
      })
      .finally(() => {
        entry.done = true;
      });
    return name;
  }

  public exportDefault(coder: Coder, isType = false): void {
    this.export(coder, isType, true);
  }

  public import(coder: Coder, isType = false, isDefault = false): string {
    const modulePath = coder.modulePath();
    const key = `${coder.id}@${modulePath}:${isType}:${isDefault}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    if (modulePath === this.path) return this.export(coder, isType, isDefault);
    const name = this.firstUniqueName(coder, isType, isDefault);
    this.cache.set(key, name);
    const script = this.repository.get(modulePath);
    const exportedName = script.export(coder, isType, isDefault);
    this.imports.set(name, {
      id: coder.exportId,
      isDefault,
      isType,
      name: exportedName,
      script,
    });
    debug("import %s as %s from %s", exportedName, name, modulePath);
    return name;
  }

  public importType(coder: Coder): string {
    return this.import(coder, true);
  }
  public importDefault(coder: Coder, isType = false): string {
    return this.import(coder, isType, true);
  }

  /** Register an extension import without exposing Script's mutable bookkeeping. */
  public importSchemaType(
    module: string,
    exported: string,
  ): ts.TypeReferenceNode {
    if (!module || !/^[$A-Z_a-z][$\w]*$/u.test(exported)) {
      throw new Error(
        "Expected a nonempty module specifier and a named type export.",
      );
    }
    const key = JSON.stringify([module, exported]);
    let entry = this.schemaImports.get(key);
    if (!entry) {
      // Avoid shadowing globals such as Array or imports emitted by built-in coders.
      const base = `__CounterfactSchemaType_${exported}`;
      let local = base;
      let suffix = 2;
      while (
        this.imports.has(local) ||
        this.exports.has(local) ||
        this.externalImport.has(local) ||
        [...this.schemaImports.values()].some((item) => item.local === local)
      )
        local = base + suffix++;
      entry = { module, exported, local };
      this.schemaImports.set(key, entry);
    }
    return ts.factory.createTypeReferenceNode(entry.local);
  }

  public assertTransformsSucceeded(): void {
    const entries = [
      ...this.exports.values(),
      ...[...this.versions.values()].flatMap((versions) => [
        ...versions.values(),
      ]),
    ];
    for (const entry of entries)
      if (entry.error instanceof SchemaTypeTransformError) throw entry.error;
  }

  public importExternal(
    name: string,
    modulePath: ModuleReference,
    isType = false,
  ): string {
    this.externalImport.set(name, { isType, modulePath });
    return name;
  }
  public importExternalType(name: string, path: ModuleReference): string {
    return this.importExternal(name, path, true);
  }
  public importSharedType(name: string): string {
    return this.importExternalType(
      name,
      pathJoin(this.relativePathToBase, "counterfact-types/index.ts"),
    );
  }
  public importVersionsType(name: string): string {
    return this.importExternalType(
      name,
      pathJoin(this.relativePathToBase, "types/versions.ts"),
    );
  }
  public exportType(coder: Coder): string {
    return this.export(coder, true);
  }

  public setVersionBuilder(
    name: string,
    builder: (versions: Map<string, ts.TypeNode>) => ts.Statement[],
  ): void {
    this.versionBuilders.set(name, builder);
  }

  public declareVersion(coder: Coder, name: string): void {
    const versions =
      this.versions.get(name) ?? new Map<string, ExportStatement>();
    this.versions.set(name, versions);
    if (versions.has(coder.version)) return;
    const entry: ExportStatement = {
      done: false,
      id: coder.exportId,
      isDefault: false,
      isType: true,
      jsdoc: "",
    };
    versions.set(coder.version, entry);
    entry.promise = coder
      .delegate()
      .then((available) => {
        entry.node = available.write(this);
        return available;
      })
      .catch((error: Error) => {
        entry.node = unknownType();
        entry.error = error;
        return undefined;
      })
      .finally(() => {
        entry.done = true;
      });
  }

  public isInProgress(): boolean {
    return [
      ...this.exports.values(),
      ...[...this.versions.values()].flatMap((versions) => [
        ...versions.values(),
      ]),
    ].some((entry) => !entry.done);
  }

  public finished(): Promise<(Coder | undefined)[]> {
    return Promise.all(
      [
        ...this.exports.values(),
        ...[...this.versions.values()].flatMap((versions) => [
          ...versions.values(),
        ]),
      ].map((entry) => entry.promise!),
    );
  }

  public externalImportStatements(
    contextPath?: string,
  ): ts.ImportDeclaration[] {
    return Array.from(this.externalImport, ([name, entry]) => {
      const modulePath =
        typeof entry.modulePath === "string"
          ? entry.modulePath
          : (contextPath ??
            pathRelative(pathDirname(this.path), "routes/_.context.ts"));
      return importDeclaration(
        name,
        modulePath.startsWith(".") || typeof entry.modulePath === "string"
          ? modulePath
          : `./${modulePath}`,
        entry.isType,
        entry.isDefault,
      );
    });
  }

  public importStatements(): ts.ImportDeclaration[] {
    return Array.from(this.imports, ([name, entry]) => {
      const path = escapePathForWindows(
        pathRelative(
          pathDirname(this.path),
          entry.script.path.replace(/\.ts$/u, ".js"),
        ),
      );
      return importDeclaration(
        name,
        path.includes("../") ? path : `./${path}`,
        entry.isType,
        entry.isDefault,
        entry.name,
      );
    });
  }

  public exportStatements(): ts.Statement[] {
    return [...this.exports.values()].flatMap((entry) => {
      if (entry.statements !== undefined) return entry.statements;
      const node = entry.node!;
      if (entry.isType) {
        if (!ts.isTypeNode(node))
          throw new Error(`Expected a type node for ${entry.name}`);
        const declaration = withComment(
          typeAlias(entry.name!, node),
          entry.jsdoc,
        );
        if (!entry.isDefault) return [declaration];
        return [
          declaration,
          ts.factory.createExportDeclaration(
            undefined,
            true,
            ts.factory.createNamedExports([
              ts.factory.createExportSpecifier(false, entry.name!, "default"),
            ]),
          ),
        ];
      }
      if (ts.isTypeNode(node))
        throw new Error(`Expected an expression for ${entry.name}`);
      const statement = entry.isDefault
        ? ts.factory.createExportAssignment(undefined, false, node)
        : ts.factory.createVariableStatement(
            [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            ts.factory.createVariableDeclarationList(
              [
                ts.factory.createVariableDeclaration(
                  entry.name!,
                  undefined,
                  entry.typeDeclaration,
                  node,
                ),
              ],
              ts.NodeFlags.Const,
            ),
          );
      return [withComment(statement, entry.jsdoc)];
    });
  }

  public versionsTypeStatements(): ts.Statement[] {
    const statements: ts.Statement[] = [];
    const unbuilt: ts.PropertySignature[] = [];
    for (const [name, versions] of this.versions) {
      const types = new Map<string, ts.TypeNode>();
      for (const [version, entry] of versions) {
        if (!entry.node || !ts.isTypeNode(entry.node))
          throw new Error(`Expected a type for ${name} version ${version}`);
        types.set(version, entry.node);
      }
      const builder = this.versionBuilders.get(name);
      if (builder) statements.push(...builder(types));
      else
        unbuilt.push(
          typeProperty(
            name,
            typeLiteral(
              [...types].map(([version, type]) => typeProperty(version, type)),
            ),
          ),
        );
    }
    if (unbuilt.length > 0)
      statements.push(typeAlias("Versions", typeLiteral(unbuilt)));
    return statements;
  }

  public async contents(contextPath?: string): Promise<string> {
    await this.finished();
    this.assertTransformsSucceeded();
    const statements = [
      ...this.versionsTypeStatements(),
      ...this.exportStatements(),
    ];
    const imports = [
      ...this.externalImportStatements(contextPath),
      ...this.importStatements(),
      ...[...this.schemaImports.values()].map((entry) =>
        importDeclaration(
          entry.local,
          entry.module,
          true,
          false,
          entry.exported,
        ),
      ),
    ];
    const used = new Set<string>();
    const visit = (node: ts.Node): void => {
      if (ts.isTypeReferenceNode(node) || ts.isTypeQueryNode(node)) {
        let name = ts.isTypeReferenceNode(node) ? node.typeName : node.exprName;
        while (ts.isQualifiedName(name)) name = name.left;
        if (ts.isIdentifier(name)) used.add(name.text);
      }
      ts.forEachChild(node, visit);
    };
    if (this.repository.options.schemaTypeTransform) statements.forEach(visit);
    return formatStatements(
      [
        ...imports.filter((declaration) => {
          if (!this.repository.options.schemaTypeTransform) return true;
          const clause = declaration.importClause;
          if (!clause?.isTypeOnly) return true;
          const named = clause.namedBindings;
          return clause.name
            ? used.has(clause.name.text)
            : named &&
                ts.isNamedImports(named) &&
                named.elements.some((element) => used.has(element.name.text));
        }),
        ...statements,
      ],
      this.comments,
    );
  }
}
