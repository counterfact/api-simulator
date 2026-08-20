import nodePath from "node:path";

declare const __forwardSlashPath: unique symbol;

export type ForwardSlashPath = string & {
  readonly [__forwardSlashPath]: never;
};

export function toForwardSlashPath(path: string): ForwardSlashPath {
  return path.replaceAll("\\", "/") as ForwardSlashPath;
}

export function pathJoin(...paths: string[]): ForwardSlashPath {
  return toForwardSlashPath(nodePath.join(...paths));
}

export function pathRelative(from: string, to: string): ForwardSlashPath {
  return toForwardSlashPath(nodePath.relative(from, to));
}

export function pathDirname(path: string): ForwardSlashPath {
  return toForwardSlashPath(nodePath.dirname(path));
}
