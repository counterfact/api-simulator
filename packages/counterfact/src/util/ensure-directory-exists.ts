import fs from "node:fs";
import nodePath from "node:path";
/* eslint-disable security/detect-non-literal-fs-filename -- helper creates parent directories for caller-provided output file paths. */

/**
 * Synchronously ensures that the directory containing `filePath` exists,
 * creating it (and any missing ancestors) if necessary.
 *
 * @param filePath - Path to a file; the *directory* part of this path is
 *   created, not the file itself.
 */
export function ensureDirectoryExists(filePath: string): void {
  const directory = nodePath.dirname(filePath);

  try {
    fs.accessSync(directory, fs.constants.W_OK);
  } catch {
    // with the async option, await doesn't seem to wait for the directory to be created
    fs.mkdirSync(directory, { recursive: true });
  }
}
