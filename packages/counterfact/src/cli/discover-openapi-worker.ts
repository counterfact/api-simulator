/* eslint-disable security/detect-non-literal-fs-filename -- reads use direct children of the worker's pinned cwd, verify filesystem identities, and enforce scan limits. */
import { constants } from "node:fs";
import { lstat, open, opendir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

export type FileIdentity = { dev: string; ino: string };

function identityOf(stat: { dev: bigint; ino: bigint }): FileIdentity {
  return { dev: String(stat.dev), ino: String(stat.ino) };
}

function matchesIdentity(
  stat: { dev: bigint; ino: bigint },
  identity: FileIdentity,
): boolean {
  return String(stat.dev) === identity.dev && String(stat.ino) === identity.ino;
}

// Only the isolated worker changes cwd. The kernel pins cwd to a directory;
// renaming/replacing its pathname cannot redirect direct-child reads. Checking
// identity after chdir rejects queued directories replaced before we enter them.
export async function scanWorkingDirectory(
  expectedRoot: FileIdentity,
  signal?: AbortSignal,
): Promise<DiscoveredSpecs> {
  const result: DiscoveredSpecs = {
    specs: [],
    limited: false,
    unreadable: false,
  };
  const directories = [
    { path: process.cwd(), relativePath: "", depth: 0, identity: expectedRoot },
  ];
  let entries = 0;
  let documents = 0;

  scan: for (const directoryEntry of directories) {
    if (signal?.aborted) break;
    try {
      process.chdir(directoryEntry.path);
      const directoryStat = await lstat(".", { bigint: true });
      if (
        !directoryStat.isDirectory() ||
        !matchesIdentity(directoryStat, directoryEntry.identity)
      ) {
        result.unreadable = true;
        continue;
      }

      const children = await opendir(".");
      for await (const entry of children) {
        if (signal?.aborted) break;
        entries += 1;
        if (entries > MAX_ENTRIES) {
          result.limited = true;
          break scan;
        }
        if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;

        const path = entry.name;
        const relativePath = join(directoryEntry.relativePath, entry.name);
        if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) {
          if (directoryEntry.depth < MAX_DEPTH) {
            const childStat = await lstat(path, { bigint: true });
            if (childStat.isDirectory()) {
              directories.push({
                path: resolve(path),
                relativePath,
                depth: directoryEntry.depth + 1,
                identity: identityOf(childStat),
              });
            }
          } else {
            result.limited = true;
          }
        } else if (
          entry.isFile() &&
          DOCUMENT_EXTENSIONS.has(extname(entry.name).toLowerCase())
        ) {
          documents += 1;
          if (documents > MAX_DOCUMENTS) {
            result.limited = true;
            break scan;
          }
          try {
            const expectedFile = await lstat(path, { bigint: true });
            if (!expectedFile.isFile()) continue;
            const file = await open(
              path,
              constants.O_RDONLY |
                (constants.O_NOFOLLOW ?? 0) |
                (constants.O_NONBLOCK ?? 0),
            );
            try {
              const stat = await file.stat({ bigint: true });
              if (
                !stat.isFile() ||
                !matchesIdentity(stat, identityOf(expectedFile))
              ) {
                result.unreadable = true;
                continue;
              }
              if (stat.size > BigInt(MAX_FILE_BYTES)) {
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
              if (signal?.aborted) break scan;
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
                // Reaching the cap alone does not mean anything was omitted.
                if (result.specs.length === MAX_SPECS) {
                  result.limited = true;
                  break scan;
                }
                result.specs.push(relativePath);
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
  }

  result.specs.sort();
  return result;
}

if (
  process.send &&
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const expectedRoot = JSON.parse(process.argv[2]!) as FileIdentity;
  const result = await scanWorkingDirectory(expectedRoot);
  process.send(result, () => {
    if (process.connected) process.disconnect();
  });
}
