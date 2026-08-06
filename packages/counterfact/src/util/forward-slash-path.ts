import nodePath from "node:path";

declare const __forwardSlashPath: unique symbol;

/**
 * A string that is guaranteed to use forward slashes as path separators,
 * with no backslashes.  This is required for URL-style paths and cross-platform
 * module identifiers.
 *
 * Obtain values of this type via {@link toForwardSlashPath}.
 */
export type ForwardSlashPath = string & {
  readonly [__forwardSlashPath]: never;
};

/**
 * Converts a file-system path to use forward slashes as separators.
 *
 * On Windows, `node:path` methods such as `path.join` and `path.resolve`
 * return paths with backslash separators.  Many parts of Counterfact
 * (chokidar watchers, ES module import specifiers, URL routing) require
 * forward slashes.  This function centralises that normalisation and returns
 * a {@link ForwardSlashPath} branded type so that call sites that demand a
 * forward-slash path are statically enforced.
 *
 * @param path - Any file-system path string.
 * @returns The same path with every `\` replaced by `/`.
 */
export function toForwardSlashPath(path: string): ForwardSlashPath {
  return path.replaceAll("\\", "/") as ForwardSlashPath;
}

/**
 * Joins path segments and returns a {@link ForwardSlashPath} with forward
 * slashes regardless of the host operating system.
 *
 * Equivalent to `toForwardSlashPath(nodePath.join(...paths))`.
 *
 * @param paths - Path segments to join.
 * @returns The joined path normalised to forward slashes.
 */
export function pathJoin(...paths: string[]): ForwardSlashPath {
  return toForwardSlashPath(nodePath.join(...paths));
}

/**
 * Returns the relative path from `from` to `to` using forward slashes.
 *
 * Equivalent to `toForwardSlashPath(nodePath.relative(from, to))`.
 *
 * @param from - The starting path.
 * @param to - The destination path.
 * @returns The relative path normalised to forward slashes.
 */
export function pathRelative(from: string, to: string): ForwardSlashPath {
  return toForwardSlashPath(nodePath.relative(from, to));
}

/**
 * Returns the directory portion of a path using forward slashes.
 *
 * Equivalent to `toForwardSlashPath(nodePath.dirname(path))`.
 *
 * @param path - The file path.
 * @returns The directory portion normalised to forward slashes.
 */
export function pathDirname(path: string): ForwardSlashPath {
  return toForwardSlashPath(nodePath.dirname(path));
}

/**
 * Resolves a sequence of paths into an absolute path using forward slashes.
 *
 * Equivalent to `toForwardSlashPath(nodePath.resolve(...paths))`.
 *
 * @param paths - Path segments to resolve.
 * @returns The resolved absolute path normalised to forward slashes.
 */
export function pathResolve(...paths: string[]): ForwardSlashPath {
  return toForwardSlashPath(nodePath.resolve(...paths));
}
