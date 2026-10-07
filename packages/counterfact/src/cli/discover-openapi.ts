/* eslint-disable security/detect-non-literal-fs-filename -- discovery stays under the selected root, skips symlinks, and bounds directory entries and file reads. */
import { constants } from "node:fs";
import { open, opendir, realpath } from "node:fs/promises";
import { extname, isAbsolute, join, relative, sep } from "node:path";

import { load as loadYaml } from "js-yaml";

const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  "bower_components",
  "vendor",
  "dist",
  "build",
  "out",
  "coverage",
  "target",
  "__pycache__",
]);
const DOCUMENT_EXTENSIONS = new Set([".json", ".yaml", ".yml"]);

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_DEPTH = 8;
const MAX_ENTRIES = 10_000;
const MAX_DOCUMENTS = 1_000;
const MAX_SPECS = 100;

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Recognition only: normal startup validates/loads the chosen document and its
// references. Discovery must never fetch URLs or resolve arbitrary $refs.
export function isSupportedOpenApiDocument(document: unknown): boolean {
  if (!isMapping(document) || !isMapping(document["info"])) return false;

  const info = document["info"];
  if (
    typeof info["title"] !== "string" ||
    typeof info["version"] !== "string"
  ) {
    return false;
  }

  const version = document["openapi"];
  if (document["swagger"] === "2.0") return isMapping(document["paths"]);
  if (typeof version !== "string" || !/^3\.[012]\.\d+$/u.test(version)) {
    return false;
  }

  return (
    isMapping(document["paths"]) ||
    (!version.startsWith("3.0.") &&
      (isMapping(document["components"]) || isMapping(document["webhooks"])))
  );
}

export type DiscoveredSpecs = {
  specs: string[];
  limited: boolean;
  unreadable: boolean;
};

export async function discoverOpenApiSpecs(
  directory: string,
  signal?: AbortSignal,
): Promise<DiscoveredSpecs> {
  const result: DiscoveredSpecs = {
    specs: [],
    limited: false,
    unreadable: false,
  };
  let root: string;
  try {
    root = await realpath(directory);
  } catch {
    result.unreadable = true;
    return result;
  }

  const directories = [{ path: root, depth: 0 }];
  let entries = 0;
  let documents = 0;

  for (const directoryEntry of directories) {
    if (signal?.aborted) break;
    try {
      // Recheck containment in case a directory was replaced while scanning.
      const location = await realpath(directoryEntry.path);
      const fromRoot = relative(root, location);
      if (
        fromRoot === ".." ||
        fromRoot.startsWith(`..${sep}`) ||
        isAbsolute(fromRoot)
      ) {
        continue;
      }

      const children = await opendir(directoryEntry.path);
      for await (const entry of children) {
        if (signal?.aborted) break;
        entries += 1;
        if (entries > MAX_ENTRIES) {
          result.limited = true;
          break;
        }
        if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;

        const path = join(directoryEntry.path, entry.name);
        if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) {
          if (directoryEntry.depth < MAX_DEPTH) {
            directories.push({ path, depth: directoryEntry.depth + 1 });
          } else {
            result.limited = true;
          }
        } else if (
          entry.isFile() &&
          DOCUMENT_EXTENSIONS.has(extname(entry.name).toLowerCase())
        ) {
          documents += 1;
          if (documents > MAX_DOCUMENTS || result.specs.length >= MAX_SPECS) {
            result.limited = true;
            break;
          }
          try {
            const file = await open(
              path,
              constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
            );
            try {
              const stat = await file.stat();
              if (!stat.isFile()) continue;
              if (stat.size > MAX_FILE_BYTES) {
                result.limited = true;
                continue;
              }
              const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
              let bytesRead = 0;
              while (bytesRead < buffer.length && !signal?.aborted) {
                const chunk = await file.read(
                  buffer,
                  bytesRead,
                  buffer.length - bytesRead,
                  bytesRead,
                );
                if (chunk.bytesRead === 0) break;
                bytesRead += chunk.bytesRead;
              }
              if (signal?.aborted) break;
              if (bytesRead > MAX_FILE_BYTES) {
                result.limited = true;
                continue;
              }
              const content = buffer.toString("utf8", 0, bytesRead);
              const document =
                extname(path).toLowerCase() === ".json"
                  ? (JSON.parse(content) as unknown)
                  : loadYaml(content, { maxAliases: 100, maxDepth: 100 });
              if (isSupportedOpenApiDocument(document)) {
                result.specs.push(relative(root, path));
              }
            } finally {
              await file.close();
            }
          } catch (error) {
            // Invalid YAML/JSON is simply not a selectable document. I/O
            // failures get one compact warning without exposing file contents.
            if (isMapping(error) && typeof error["code"] === "string") {
              result.unreadable = true;
            }
          }
        }
      }
    } catch {
      result.unreadable = true;
    }
    if (
      entries > MAX_ENTRIES ||
      documents > MAX_DOCUMENTS ||
      result.specs.length >= MAX_SPECS
    ) {
      result.limited = true;
      break;
    }
  }

  result.specs.sort();
  return result;
}
