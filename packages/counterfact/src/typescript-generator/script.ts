import createDebugger from "debug";
import { format } from "prettier";

import { escapePathForWindows } from "../util/windows-escape.js";
import {
  pathJoin,
  pathRelative,
  pathDirname,
} from "../util/forward-slash-path.js";
import type { Coder, ExportStatement } from "./coder.js";
import type { Repository } from "./repository.js";

const debug = createDebugger("counterfact:typescript-generator:script");

interface ImportEntry {
  isDefault: boolean;
  isType: boolean;
  name: string;
  script: Script;
}

interface ExternalImportEntry {
  isDefault?: boolean;
  isType: boolean;
  modulePath: string;
}

/**
 * Represents a single TypeScript file being assembled by the code generator.
 *
 * A `Script` accumulates exports, imports, and external imports contributed by
 * {@link Coder} instances.  Once all coders have resolved, {@link contents}
 * formats the result with Prettier and returns the final source text.
 *
 * Scripts are created and retrieved through a {@link Repository} so that the
 * same module path always maps to the same `Script` instance.
 */
export class Script {
  public repository: Repository;
  public comments: string[];
  public exports: Map<string, ExportStatement>;
  public versions: Map<string, Map<string, ExportStatement>>;
  public versionFormatters: Map<
    string,
    (versionCodes: Map<string, string>) => string
  >;

  public imports: Map<string, ImportEntry>;
  public externalImport: Map<string, ExternalImportEntry>;
  public cache: Map<string, string>;
  public typeCache: Map<string, string>;
  public path: string;

  public constructor(repository: Repository, path: string) {
    this.repository = repository;
    this.comments = [];
    this.exports = new Map();
    this.versions = new Map();
    this.versionFormatters = new Map();
    this.imports = new Map();
    this.externalImport = new Map();
    this.cache = new Map();
    this.typeCache = new Map();
    this.path = path;
  }

  /**
   * A `"../"` path fragment that points from this script's directory back to
   * the repository root, used to resolve relative import paths.
   */
  public get relativePathToBase(): string {
    return this.path
      .split("/")
      .slice(0, -1)
      .map(() => "..")
      .join("/");
  }

  /**
   * Picks the first name from `coder.names()` that is not already used as an
   * import in this script, ensuring export/import name uniqueness.
   *
   * @param coder - The coder needing a name.
   * @throws When all 100 candidate names are already taken.
   */
  public firstUniqueName(coder: Coder): string {
    for (const name of coder.names()) {
      if (!this.imports.has(name)) {
        return name;
      }
    }

    throw new Error(`could not find a unique name for ${coder.id}`);
  }

  /**
   * Registers an export for `coder` in this script and returns the export name.
   *
   * If the same coder has already been exported (cache hit), the previously
   * assigned name is returned without creating a duplicate.
   *
   * @param coder - The coder to export.
   * @param isType - Emit `export type` instead of `export const`.
   * @param isDefault - Emit `export default` instead of a named export.
   * @returns The name under which the coder is exported.
   */
  public export(coder: Coder, isType = false, isDefault = false): string {
    const cacheKey = isDefault ? "default" : `${coder.id}:${isType}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const name = this.firstUniqueName(coder);

    this.cache.set(cacheKey, name);

    const exportStatement: ExportStatement = {
      beforeExport: coder.beforeExport(this.path),
      done: false,
      id: coder.id,
      isDefault,
      isType,
      jsdoc: "",
      typeDeclaration: coder.typeDeclaration(this.exports, this),
    };

    exportStatement.promise = coder
      .delegate()

      .then((availableCoder) => {
        exportStatement.name = name;
        exportStatement.code = availableCoder.write(this);
        exportStatement.jsdoc = availableCoder.jsdoc();

        return availableCoder;
      })

      .catch((error: Error) => {
        exportStatement.code = `{/* error creating export "${name}" for ${this.path}: ${error.stack} */}`;
        exportStatement.error = error;
        return undefined;
      })

      .finally(() => {
        exportStatement.done = true;
      });

    this.exports.set(name, exportStatement);

    return name;
  }

  public exportDefault(coder: Coder, isType = false): void {
    this.export(coder, isType, true);
  }

  /**
   * Registers an import of `coder` from its owning module and returns the
   * local alias used in this script.
   *
   * The coder is also exported from its home module as a side effect.
   *
   * @param coder - The coder to import.
   * @param isType - Use a `import type` declaration.
   * @param isDefault - Import the default export rather than a named export.
   */
  public import(coder: Coder, isType = false, isDefault = false): string {
    debug("import coder: %s", coder.id);

    const modulePath = coder.modulePath();

    const cacheKey = `${coder.id}@${modulePath}:${isType}:${isDefault}`;

    debug("cache key: %s", cacheKey);

    if (this.cache.has(cacheKey)) {
      debug("cache hit: %s", cacheKey);

      return this.cache.get(cacheKey)!;
    }

    debug("cache miss: %s", cacheKey);

    const name = this.firstUniqueName(coder);

    this.cache.set(cacheKey, name);

    const scriptFromWhichToExport = this.repository.get(modulePath);

    const exportedName = scriptFromWhichToExport.export(
      coder,
      isType,
      isDefault,
    );

    this.imports.set(name, {
      isDefault,
      isType,
      name: exportedName,
      script: scriptFromWhichToExport,
    });

    return name;
  }

  public importType(coder: Coder): string {
    return this.import(coder, true);
  }

  public importDefault(coder: Coder, isType = false): string {
    return this.import(coder, isType, true);
  }

  /**
   * Registers an import from an external npm package or absolute module path
   * (not managed by the repository).
   *
   * @param name - The local binding name.
   * @param modulePath - The module specifier (e.g. `"counterfact-types/index"`).
   * @param isType - Use a `import type` declaration.
   * @returns `name` (for convenience in method chaining).
   */
  public importExternal(
    name: string,
    modulePath: string,
    isType = false,
  ): string {
    this.externalImport.set(name, { isType, modulePath });

    return name;
  }

  /**
   * Convenience wrapper that calls {@link importExternal} with `isType = true`.
   */
  public importExternalType(name: string, modulePath: string): string {
    return this.importExternal(name, modulePath, true);
  }

  /**
   * Imports a type from the shared `counterfact-types/index.ts` module,
   * resolving the path relative to this script's location in the repository.
   *
   * @param name - The type name to import (e.g. `"WideOperationArgument"`).
   */
  public importSharedType(name: string): string {
    return this.importExternal(
      name,
      pathJoin(this.relativePathToBase, "counterfact-types/index.ts"),
      true,
    );
  }

  /**
   * Imports a type from the generated `types/versions.ts` module,
   * resolving the path relative to this script's location in the repository.
   *
   * @param name - The type name to import (e.g. `"Versioned"`).
   */
  public importVersionsType(name: string): string {
    return this.importExternal(
      name,
      pathJoin(this.relativePathToBase, "types/versions.ts"),
      true,
    );
  }

  public exportType(coder: Coder): string {
    return this.export(coder, true);
  }

  /**
   * Registers a formatter function for the merged versioned type emitted under
   * `name` by {@link versionsTypeStatements}.
   *
   * When a formatter is present for a name, `versionsTypeStatements` delegates
   * the entire type declaration to it instead of generating the default
   * `Versions` object type.  The formatter receives a `Map<version, importAlias>`
   * and must return the complete TypeScript source for that operation type.
   */
  public setVersionFormatter(
    name: string,
    formatter: (versionCodes: Map<string, string>) => string,
  ): void {
    this.versionFormatters.set(name, formatter);
  }

  public declareVersion(coder: Coder, name: string): void {
    const version = coder.version;

    const versions =
      this.versions.get(name) ?? new Map<string, ExportStatement>();
    this.versions.set(name, versions);

    if (versions.has(version)) {
      return;
    }

    const versionStatement: ExportStatement = {
      beforeExport: "",
      done: false,
      id: coder.id,
      isDefault: false,
      isType: true,
      jsdoc: "",
      typeDeclaration: "",
    };

    versionStatement.promise = coder
      .delegate()
      .then((availableCoder) => {
        versionStatement.code = availableCoder.write(this);

        return availableCoder;
      })
      .catch((error: Error) => {
        versionStatement.code = `unknown /* error declaring version "${name}" (${version}) for ${this.path}: ${error.message} */`;
        versionStatement.error = error;
        return undefined;
      })
      .finally(() => {
        versionStatement.done = true;
      });

    versions.set(version, versionStatement);
  }

  /** `true` while at least one export promise is still pending. */
  public isInProgress(): boolean {
    return (
      Array.from(this.exports.values()).some(
        (exportStatement) => !exportStatement.done,
      ) ||
      Array.from(this.versions.values())
        .flatMap((versions) => Array.from(versions.values()))
        .some((versionStatement) => !versionStatement.done)
    );
  }

  /** Returns a promise that resolves when all pending export promises settle. */
  public finished(): Promise<(Coder | undefined)[]> {
    return Promise.all([
      ...Array.from(this.exports.values(), (value) => value.promise!),
      ...Array.from(this.versions.values())
        .flatMap((versions) => Array.from(versions.values()))
        .map((value) => value.promise!),
    ]);
  }

  public externalImportStatements(): string[] {
    return Array.from(
      this.externalImport,
      ([name, { isDefault, isType, modulePath }]) =>
        `import${isType ? " type" : ""} ${
          isDefault ? name : `{ ${name} }`
        } from "${modulePath}";`,
    );
  }

  public importStatements(): string[] {
    return Array.from(this.imports, ([name, { isDefault, isType, script }]) => {
      const resolvedPath = escapePathForWindows(
        pathRelative(
          pathDirname(this.path),
          script.path.replace(/\.ts$/u, ".js"),
        ),
      );

      return `import${isType ? " type" : ""} ${
        isDefault ? name : `{ ${name} }`
      } from "${resolvedPath.includes("../") ? "" : "./"}${resolvedPath}";`;
    });
  }

  public exportStatements(): string[] {
    return Array.from(
      this.exports.values(),
      ({
        beforeExport,
        code,
        isDefault,
        isType,
        jsdoc,
        name,
        typeDeclaration,
      }) => {
        if (typeof code === "object" && code !== null && "raw" in code) {
          return code.raw;
        }

        if (isDefault) {
          return `${jsdoc}${beforeExport}export default ${code as string};`;
        }

        const keyword = isType ? "type" : "const";
        const typeAnnotation =
          (typeDeclaration ?? "").length === 0
            ? ""
            : `:${typeDeclaration ?? ""}`;

        return `${jsdoc}${beforeExport}export ${keyword} ${name ?? ""}${typeAnnotation} = ${code as string};`;
      },
    );
  }

  public versionsTypeStatements(): string[] {
    if (this.versions.size === 0) {
      return [];
    }

    const statements: string[] = [];
    const unformatted: Array<[string, Map<string, ExportStatement>]> = [];

    for (const [name, versions] of this.versions) {
      const formatter = this.versionFormatters.get(name);

      if (formatter) {
        const versionCodes = new Map(
          Array.from(versions, ([version, stmt]) => [
            version,
            stmt.code as string,
          ]),
        );

        statements.push(formatter(versionCodes));
      } else {
        unformatted.push([name, versions]);
      }
    }

    if (unformatted.length > 0) {
      const names = unformatted.map(([name, versions]) => {
        const mappedVersions = Array.from(
          versions,
          ([version, versionStatement]) =>
            `"${version}": ${versionStatement.code as string}`,
        );

        return `"${name}": { ${mappedVersions.join(", ")} }`;
      });

      statements.push(`export type Versions = { ${names.join(", ")} };`);
    }

    return statements;
  }

  /**
   * Formats the fully assembled script source with Prettier and returns it.
   *
   * All pending export promises are awaited before formatting.
   */
  public async contents(): Promise<string> {
    await this.finished();

    return format(
      [
        this.comments.map((comment) => `// ${comment}`).join("\n"),
        this.comments.length > 0 ? "\n\n" : "",
        this.externalImportStatements().join("\n"),
        this.importStatements().join("\n"),
        "\n\n",
        this.versionsTypeStatements().join("\n"),
        this.versions.size > 0 ? "\n\n" : "",
        this.exportStatements().join("\n\n"),
      ].join(""),
      { parser: "typescript" },
    );
  }
}
