// Stryker disable all

import { once } from "node:events";
import fs from "node:fs/promises";
/* eslint-disable security/detect-non-literal-fs-filename -- transpiler consumes watched source files and writes paired outputs under configured directories. */

import { type FSWatcher, watch as chokidarWatch } from "chokidar";
import createDebug from "debug";
import ts from "typescript";

import { ensureDirectoryExists } from "../util/ensure-directory-exists.js";
import { toForwardSlashPath, pathJoin } from "../util/forward-slash-path.js";
import { CHOKIDAR_OPTIONS } from "./constants.js";
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
  private readonly sourcePath: string;

  private readonly destinationPath: string;

  private readonly moduleKind: string;

  private watcher: FSWatcher | undefined;

  public constructor(
    sourcePath: string,
    destinationPath: string,
    moduleKind: string,
  ) {
    super();
    this.sourcePath = sourcePath;
    this.destinationPath = destinationPath;
    this.moduleKind = moduleKind;
  }

  private get extension() {
    return this.moduleKind.toLowerCase() === "commonjs" ? ".cjs" : ".js";
  }

  /**
   * Starts the file-system watcher and transpiles all existing files in the
   * source path.  Resolves once the initial scan and all pending transpiles
   * are complete.
   */
  public async watch(): Promise<void> {
    debug("transpiler: watch");
    this.watcher = chokidarWatch(this.sourcePath, {
      ...CHOKIDAR_OPTIONS,
      ignored: `${this.sourcePath}/js`,
      ignoreInitial: false,
    });

    const transpiles: Promise<void>[] = [];

    this.watcher.on(
      "all",

      async (eventName: string, sourcePathOriginal: string) => {
        debug("transpiler event: %s <%s>", eventName, sourcePathOriginal);

        const JS_EXTENSIONS = ["js", "mjs", "ts", "mts"];

        if (
          !JS_EXTENSIONS.some((extension) =>
            sourcePathOriginal.endsWith(`.${extension}`),
          )
        )
          return;

        const sourcePath = toForwardSlashPath(sourcePathOriginal);

        const destinationPath = toForwardSlashPath(
          sourcePath
            .replace(this.sourcePath, this.destinationPath)
            .replace(".ts", this.extension),
        );

        if (["add", "change"].includes(eventName)) {
          transpiles.push(
            this.transpileFile(eventName, sourcePath, destinationPath),
          );
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

    await Promise.all(transpiles);
  }

  /** Closes the file-system watcher. */
  public async stopWatching(): Promise<void> {
    await this.watcher?.close();
  }

  private async transpileFile(
    eventName: string,
    sourcePath: string,
    destinationPath: string,
  ): Promise<void> {
    ensureDirectoryExists(destinationPath);

    const source = await fs.readFile(sourcePath, "utf8");

    const transpileOutput = ts.transpileModule(source, {
      compilerOptions: {
        module:
          ts.ModuleKind[
            this.moduleKind.toLowerCase() === "module" ? "ES2022" : "CommonJS"
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

    const fullDestination = pathJoin(
      sourcePath
        .replace(this.sourcePath, this.destinationPath)
        .replace(".ts", this.extension),
    );

    const resultWithTransformedFileExtensions =
      convertFileExtensionsToCjs(result);

    try {
      await fs.writeFile(fullDestination, resultWithTransformedFileExtensions);
    } catch (error) {
      debug(
        "error writing transpiled output to %s: %o",
        fullDestination,
        error,
      );
      this.dispatchEvent(new Event("error"));

      throw new Error("could not transpile", { cause: error });
    }

    this.dispatchEvent(new Event("write"));
  }
}
