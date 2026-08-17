import fs from "node:fs";
import nodePath from "node:path";
/* eslint-disable security/detect-non-literal-fs-filename -- helper creates parent directories for caller-provided output file paths. */

export function ensureDirectoryExists(filePath: string): void {
  const directory = nodePath.dirname(filePath);

  try {
    fs.accessSync(directory, fs.constants.W_OK);
  } catch {
    fs.mkdirSync(directory, { recursive: true });
  }
}
