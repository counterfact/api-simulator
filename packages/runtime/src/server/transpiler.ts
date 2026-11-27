// Stryker disable all

import { once } from "node:events";
import { existsSync } from "node:fs";
import nodePath from "node:path";
import fs from "node:fs/promises";
/* eslint-disable security/detect-non-literal-fs-filename -- transpiler consumes watched source files and writes paired outputs under configured directories. */

import { type FSWatcher, watch as chokidarWatch } from "chokidar";
import createDebug from "debug";
import ts from "typescript";

import { ensureDirectoryExists } from "../util/ensure-directory-exists.js";
import { toForwardSlashPath } from "../util/forward-slash-path.js";
import { writeFileAtomically } from "../util/write-file-atomically.js";
import { CHOKIDAR_OPTIONS } from "./constants.js";
import { FileDiscovery } from "./file-discovery.js";
import { convertFileExtensionsToCjs } from "./convert-js-extensions-to-cjs.js";

const debug = createDebug("counterfact:server:transpiler");

/**
 * Watches TypeScript source files in `sourcePath` and compiles them to
 * JavaScript in `destinationPath` using the TypeScript compiler API.
 *
 * Used when the runtime cannot execute TypeScript natively (i.e. Node.js
 * without the `--experimental-strip-types` flag).  Each file is compiled
 * independently (no type-checking) for maximum speed.
 *
 * Emits DOM-style events: `"write"` after a successful transpile, `"delete"`
 * after a source file is removed, and `"error"` on write or compilation errors.
 */
export class Transpiler extends EventTarget {
  private sourcePath: string;

  private destinationPath: string;

  private readonly moduleKind: string;

  private watcher: FSWatcher | undefined;

  public constructor(
    sourcePath: string,
    destinationPath: string,
    moduleKind: string,
  ) {
    super();
    this.sourcePath = toForwardSlashPath(sourcePath);
    this.destinationPath = toForwardSlashPath(destinationPath);
    this.moduleKind = moduleKind;
  }

  private async canonicalPath(path: string): Promise<string> {
    try {
      return toForwardSlashPath(await fs.realpath(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = nodePath.dirname(path);
      if (parent === path) throw error;
      return toForwardSlashPath(
        nodePath.join(
          await this.canonicalPath(parent),
          nodePath.basename(path),
        ),
      );
    }
  }

  private destinationFor(sourcePath: string): string {
    const commonjs =
      /\.(?:cjs|cts)$/u.test(sourcePath) ||
      this.moduleKind.toLowerCase() !== "module";
    const extension = commonjs
      ? ".cjs"
      : /\.(?:mjs|mts)$/u.test(sourcePath)
        ? ".mjs"
        : ".js";
    return toForwardSlashPath(
      nodePath
        .join(
          this.destinationPath,
          nodePath.relative(this.sourcePath, sourcePath),
        )
        .replace(/\.[cm]?[jt]s$/u, extension),
    );
  }

  /**
   * Starts the file-system watcher and transpiles all existing files in the
   * source path.  Resolves once the initial scan and all pending transpiles
   * are complete.
   */
  public async watch(): Promise<void> {
    debug("transpiler: watch");
    await fs.mkdir(this.destinationPath, { recursive: true });
    this.sourcePath = await this.canonicalPath(this.sourcePath);
    this.destinationPath = await this.canonicalPath(this.destinationPath);
    this.watcher = chokidarWatch(this.sourcePath, {
      ...CHOKIDAR_OPTIONS,
      ignored: `${this.sourcePath}/js`,
      ignoreInitial: true,
    });

    const transpiles: Promise<void>[] = [];

    this.watcher.on(
      "all",

      async (eventName: string, sourcePathOriginal: string) => {
        debug("transpiler event: %s <%s>", eventName, sourcePathOriginal);

        const JS_EXTENSIONS = ["js", "mjs", "cjs", "ts", "mts", "cts"];

        if (
          !JS_EXTENSIONS.some((extension) =>
            sourcePathOriginal.endsWith(`.${extension}`),
          )
        )
          return;

        const sourcePath = toForwardSlashPath(sourcePathOriginal);

        const destinationPath = this.destinationFor(sourcePath);

        if (["add", "change"].includes(eventName)) {
          transpiles.push(this.transpileFile(sourcePath, destinationPath));
        }

        if (eventName === "unlink") {
          try {
            await fs.rm(destinationPath);
          } catch (error) {
            if ((error as { code: string }).code !== "ENOENT") {
              debug("error removing %s: %o", destinationPath, error);
              this.dispatchEvent(new Event("error"));

              throw error;
            }
          }

          this.dispatchEvent(new Event("delete"));
        }
      },
    );

    await once(this.watcher, "ready");

    // Watcher readiness does not reliably deliver every initial add event on
    // Windows. Enumerate the existing sources explicitly before publishing
    // a usable cache; keep the watcher active to catch later edits.
    let sources: string[] = [];
    try {
      await fs.access(this.sourcePath);
      sources = await new FileDiscovery(this.sourcePath).findFiles();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await Promise.all([
      ...transpiles,
      ...sources
        .filter((source) => !source.startsWith(`${this.sourcePath}/js/`))
        .map((source) =>
          this.transpileFile(source, this.destinationFor(source)),
        ),
    ]);
  }

  /** Closes the file-system watcher. */
  public async stopWatching(): Promise<void> {
    await this.watcher?.close();
  }

  private async transpileFile(
    sourcePath: string,
    destinationPath: string,
  ): Promise<void> {
    ensureDirectoryExists(destinationPath);

    const source = await fs.readFile(sourcePath, "utf8");

    const transpileOutput = ts.transpileModule(source, {
      compilerOptions: {
        module:
          ts.ModuleKind[
            /\.(?:cjs|cts)$/u.test(sourcePath) ||
            this.moduleKind.toLowerCase() !== "module"
              ? "CommonJS"
              : "ES2022"
          ],

        target: ts.ScriptTarget.ES2015,
      },
      reportDiagnostics: true,
    });

    if (transpileOutput.diagnostics?.length) {
      for (const diagnostic of transpileOutput.diagnostics) {
        const message = ts.flattenDiagnosticMessageText(
          diagnostic.messageText,
          "\n",
        );
        debug("TypeScript diagnostic in %s: %s", sourcePath, message);
      }
    }

    const result: string = transpileOutput.outputText;

    const resultWithTransformedFileExtensions = convertFileExtensionsToCjs(
      result,
      (specifier) => {
        const target = nodePath.resolve(
          nodePath.dirname(sourcePath),
          specifier,
        );
        // A dot in a basename is not necessarily an extension: ./my.helper
        // can resolve my.helper.ts. Preserve actual assets such as data.json.
        return (
          !existsSync(target) &&
          ["js", "ts", "cjs", "cts", "mjs", "mts"].some((extension) =>
            existsSync(`${target}.${extension}`),
          )
        );
      },
    );

    try {
      // Publish complete files even if duplicate watch events overlap. Readers
      // must never observe the truncate/write window of an in-place update.
      await writeFileAtomically(
        destinationPath,
        resultWithTransformedFileExtensions,
      );
    } catch (error) {
      debug(
        "error writing transpiled output to %s: %o",
        destinationPath,
        error,
      );
      this.dispatchEvent(new Event("error"));

      throw new Error("could not transpile", { cause: error });
    }

    this.dispatchEvent(new Event("write"));
  }
}
