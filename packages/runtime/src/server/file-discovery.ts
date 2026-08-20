import { existsSync } from "node:fs";
import fs from "node:fs/promises";
/* eslint-disable security/detect-non-literal-fs-filename -- discovery walks directories rooted at basePath and uses Dirent-provided names. */

import { toForwardSlashPath, pathJoin } from "../util/forward-slash-path.js";
import { escapePathForWindows } from "../util/windows-escape.js";

const JS_EXTENSIONS = new Set(["cjs", "cts", "js", "mjs", "mts", "ts"]);

/**
 * Recursively discovers JavaScript/TypeScript source files under a base
 * directory.
 *
 * Only files with one of the following extensions are returned:
 * `js`, `mjs`, `cjs`, `ts`, `mts`, `cts`.
 */
export class FileDiscovery {
  private readonly basePath: string;

  public constructor(basePath: string) {
    this.basePath = toForwardSlashPath(basePath);
  }

  /**
   * Returns an array of absolute file paths for all JS/TS files found
   * recursively under `basePath/directory`.
   *
   * @param directory - Sub-directory relative to `basePath` to start from.
   *   Defaults to `""` (the base path itself).
   * @throws When `basePath/directory` does not exist.
   */
  public async findFiles(directory = ""): Promise<string[]> {
    const fullDir = pathJoin(this.basePath, directory);

    if (!existsSync(fullDir)) {
      throw new Error(`Directory does not exist ${fullDir}`);
    }

    const entries = await fs.readdir(fullDir, { withFileTypes: true });

    const results = await Promise.all(
      entries.map(async (entry) => {
        if (entry.isDirectory()) {
          return this.findFiles(pathJoin(directory, entry.name));
        }

        const extension = entry.name.split(".").at(-1);

        if (!JS_EXTENSIONS.has(extension ?? "")) {
          return [];
        }

        const fullPath = pathJoin(this.basePath, directory, entry.name);

        return [escapePathForWindows(fullPath)];
      }),
    );

    return results.flat();
  }
}
