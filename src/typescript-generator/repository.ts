import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import nodePath, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
/* eslint-disable security/detect-non-literal-fs-filename -- repository writes and stats generated files only inside destination output directories. */

import createDebug from "debug";

import { ensureDirectoryExists } from "../util/ensure-directory-exists.js";
import {
  toForwardSlashPath,
  pathJoin,
  pathRelative,
  pathDirname,
} from "../util/forward-slash-path.js";
import { CONTEXT_FILE_TOKEN } from "./context-file-token.js";
import { Script } from "./script.js";
import { escapePathForWindows } from "../util/windows-escape.js";

const debug = createDebug("counterfact:server:repository");

const __dirname = toForwardSlashPath(dirname(fileURLToPath(import.meta.url)));

debug("dirname is %s", __dirname);

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
    const sourcePath = nodePath.join(
      __dirname,
      "../../dist/server/counterfact-types",
    );
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
        const contents = await script.contents();

        const fullPath = escapePathForWindows(pathJoin(destination, path));

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
            await this.appendNewHandlers(
              fullPath,
              contents.replaceAll(
                CONTEXT_FILE_TOKEN,
                this.findContextPath(destination, path),
              ),
            );

            return;
          }
        }

        if (shouldWriteRoutes || shouldWriteTypes) {
          debug("about to write", fullPath);
          await fs.writeFile(
            fullPath,
            contents.replaceAll(
              CONTEXT_FILE_TOKEN,
              this.findContextPath(destination, path),
            ),
          );
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

    await fs.writeFile(
      contextFilePath,
      `import type { Context$ } from "../types/_.context.js";

/**
 * This is the default context for Counterfact.
 *
 * It defines the context object in the REPL
 * and the $.context object in the code.
 *
 * Add properties and methods to suit your needs.
 *
 * See https://github.com/counterfact/api-simulator/blob/main/docs/features/state.md
 */

export class Context {
  constructor($: Context$) {
    void $;
  }
}
`,
    );
  }

  /**
   * Appends any HTTP-method handler exports that appear in `generatedContent`
   * but are absent from the existing file at `fullPath`.
   *
   * For each new export the corresponding `import type` statement is inserted
   * after the last existing import line (or prepended when no imports exist),
   * and the export block is appended at the end of the file.
   *
   * @param fullPath - Absolute path of the route file to update.
   * @param generatedContent - The fully-generated file content (used as the
   *   source of new import and export statements).
   */
  private async appendNewHandlers(
    fullPath: string,
    generatedContent: string,
  ): Promise<void> {
    const existingContent = await fs.readFile(fullPath, "utf8");

    // Names already exported by the existing file (e.g. GET, POST).
    const existingExportNames = new Set<string>(
      Array.from(
        existingContent.matchAll(/^export\s+const\s+(\w+)/gmu),
        (m) => m[1],
      ),
    );

    // All named exports in the generated content together with their type names.
    const generatedExports = Array.from(
      generatedContent.matchAll(/^export\s+const\s+(\w+)\s*:\s*(\w+)/gmu),
      (m) => ({ methodName: m[1], typeName: m[2] }),
    );

    const newExports = generatedExports.filter(
      ({ methodName }) => !existingExportNames.has(methodName),
    );

    if (newExports.length === 0) {
      debug(`no new handlers to append to ${fullPath}`);

      return;
    }

    debug(
      `appending ${newExports.length} new handler(s) to ${fullPath}: %o`,
      newExports.map(({ methodName }) => methodName),
    );

    const newImportLines: string[] = [];
    const newExportBlocks: string[] = [];

    for (const { methodName, typeName } of newExports) {
      // Both names come from \w+ captures so they are safe identifiers, but
      // guard explicitly to satisfy static analysis and avoid RegExp injection.
      if (!/^\w+$/u.test(typeName) || !/^\w+$/u.test(methodName)) {
        debug(
          `skipping handler with unsafe name – methodName: %s, typeName: %s`,
          methodName,
          typeName,
        );
        continue;
      }

      // Find the `import type { TypeName } from "..."` line for this type.
      const importMatch = generatedContent.match(
        new RegExp(
          `^import\\s+type\\s+\\{[^}]*\\b${typeName}\\b[^}]*\\}\\s+from\\s+["'][^"']+["'];`,
          "mu",
        ),
      );

      if (importMatch?.[0] && !existingContent.includes(importMatch[0])) {
        newImportLines.push(importMatch[0]);
      }

      // Find the export block: from `export const METHOD` to the closing `};`.
      // The generated code is always Prettier-formatted, so the closing brace
      // and semicolon of every top-level arrow-function export appear on their
      // own line as `\n};`.
      const startMatch = new RegExp(
        `^export\\s+const\\s+${methodName}\\b`,
        "mu",
      ).exec(generatedContent);

      if (startMatch) {
        const fromExport = generatedContent.slice(startMatch.index);
        const closingIndex = fromExport.indexOf("\n};");

        if (closingIndex !== -1) {
          // Include the closing `};` (3 chars: \n, }, ;)
          newExportBlocks.push(fromExport.slice(0, closingIndex + 3));
        }
      }
    }

    let updatedContent = existingContent;

    // Insert new import lines right after the last existing import statement.
    if (newImportLines.length > 0) {
      const importMatches = [...existingContent.matchAll(/^import\s[^\n]*/gmu)];

      if (importMatches.length > 0) {
        const lastImport = importMatches[importMatches.length - 1];

        if (lastImport.index === undefined) {
          debug(
            `could not determine last import position in ${fullPath}; skipping import insertion`,
          );

          return;
        }

        const lineEnd = existingContent.indexOf("\n", lastImport.index);
        const insertPos = lineEnd === -1 ? existingContent.length : lineEnd + 1;

        updatedContent =
          existingContent.slice(0, insertPos) +
          newImportLines.join("\n") +
          "\n" +
          existingContent.slice(insertPos);
      } else {
        updatedContent = newImportLines.join("\n") + "\n" + existingContent;
      }
    }

    // Append new export blocks at the end of the file.
    if (newExportBlocks.length > 0) {
      const separator = updatedContent.endsWith("\n") ? "\n" : "\n\n";
      updatedContent += separator + newExportBlocks.join("\n\n") + "\n";
    }

    await fs.writeFile(fullPath, updatedContent);
    debug(`appended new handlers to ${fullPath}`);
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
