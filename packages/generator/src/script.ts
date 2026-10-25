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
        !this.externalImport.has(name)
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
    return formatStatements(
      [
        ...this.externalImportStatements(contextPath),
        ...this.importStatements(),
        ...this.versionsTypeStatements(),
        ...this.exportStatements(),
      ],
      this.comments,
    );
  }
}
