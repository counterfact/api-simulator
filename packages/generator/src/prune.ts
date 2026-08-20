import fs from "node:fs/promises";
import nodePath from "node:path";
/* eslint-disable security/detect-non-literal-fs-filename -- pruning only traverses and removes files under generator-owned destination subdirectories. */

import createDebug from "debug";

import { toForwardSlashPath } from "./forward-slash-path.js";
import { normalizeOpenApiPath } from "./openapi-path.js";

const debug = createDebug("counterfact:typescript-generator:prune");

/**
 * Collects all .ts route files in a directory recursively.
 * Context files (_.context.ts) are excluded.
 * @param routesDir - Path to routes directory
 * @param currentPath - Current subdirectory being processed (relative to routesDir)
 * @returns Array of relative paths (using forward slashes)
 */
async function collectTypeScriptFiles(
  rootDir: string,
  currentPath = "",
): Promise<string[]> {
  const files: string[] = [];

  try {
    const fullDir = currentPath ? nodePath.join(rootDir, currentPath) : rootDir;
    const entries = await fs.readdir(fullDir, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = currentPath
        ? `${currentPath}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        files.push(...(await collectTypeScriptFiles(rootDir, relativePath)));
      } else if (entry.name.endsWith(".ts")) {
        files.push(relativePath);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return files;
}

/**
 * Recursively removes empty directories under rootDir, but not rootDir itself.
 * @param dir - Directory to check
 * @param rootDir - Root directory that should never be removed
 */
async function removeEmptyDirectories(
  dir: string,
  rootDir: string,
): Promise<void> {
  let entries;

  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    debug("could not read directory %s: %o", dir, error);
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      await removeEmptyDirectories(nodePath.join(dir, entry.name), rootDir);
    }
  }

  if (nodePath.resolve(dir) === nodePath.resolve(rootDir)) {
    return;
  }

  const remaining = await fs.readdir(dir);

  if (remaining.length === 0) {
    await fs.rmdir(dir);
    debug("removed empty directory: %s", dir);
  }
}

/**
 * Converts an OpenAPI path to the expected route file path (relative to routesDir).
 * e.g. "/pet/{id}" -> "pet/{id}.ts", "/" -> "index.ts"
 * @param openApiPath - The OpenAPI path string
 */
function openApiPathToRouteFile(openApiPath: string): string {
  const normalizedPath = normalizeOpenApiPath(openApiPath);
  const filePath = normalizedPath === "/" ? "index" : normalizedPath.slice(1);

  return `${filePath}.ts`;
}

/**
 * Prunes route files that no longer correspond to any path in the OpenAPI spec.
 * Context files (_.context.ts) are never pruned.
 * @param destination - Base destination directory (contains the routes/ sub-directory)
 * @param openApiPaths - Iterable of OpenAPI path strings (e.g. "/pet/{id}")
 * @returns Number of files removed
 */
export async function pruneRoutes(
  destination: string,
  openApiPaths: Iterable<string>,
): Promise<number> {
  const routesDir = nodePath.join(destination, "routes");

  const expectedFiles = new Set(
    Array.from(openApiPaths).map(openApiPathToRouteFile),
  );

  debug("expected route files: %o", Array.from(expectedFiles));

  const actualFiles = (await collectTypeScriptFiles(routesDir)).filter(
    (file) => nodePath.basename(file) !== "_.context.ts",
  );

  debug("actual route files: %o", actualFiles);

  let prunedCount = 0;

  for (const file of actualFiles) {
    const normalizedFile = toForwardSlashPath(file);

    if (!expectedFiles.has(normalizedFile)) {
      const fullPath = nodePath.join(routesDir, file);

      debug("pruning %s", fullPath);
      await fs.rm(fullPath);
      prunedCount++;
    }
  }

  await removeEmptyDirectories(routesDir, routesDir);

  debug("pruned %d files", prunedCount);

  return prunedCount;
}

/**
 * Returns whether a path below `types/` belongs to a namespace populated by
 * the OpenAPI generator. Context support and arbitrary user-authored type
 * modules are deliberately outside this ownership policy.
 */
function isGeneratorOwnedTypePath(path: string): boolean {
  const [first, second] = toForwardSlashPath(path).split("/");
  const generatedCategory = (segment: string | undefined) =>
    segment === "paths" || segment === "components" || segment === "#";

  return (
    path === "versions.ts" ||
    generatedCategory(first) ||
    generatedCategory(second)
  );
}

/**
 * Prunes obsolete files from the OpenAPI generator-owned namespaces below
 * `types/`. Hidden files are included by the recursive directory walk.
 *
 * `types/_.context.ts` and paths outside the known generated namespaces are
 * preserved because separate generators or users own them.
 *
 * @param destination - Base destination directory (contains `types/`).
 * @param expectedPaths - Repository-relative generated paths to retain.
 * @returns Number of files removed.
 */
export async function pruneTypes(
  destination: string,
  expectedPaths: Iterable<string>,
): Promise<number> {
  const typesDir = nodePath.join(destination, "types");
  const expectedFiles = new Set(
    Array.from(expectedPaths, (path) =>
      toForwardSlashPath(path).replace(/^types\//u, ""),
    ),
  );
  const actualFiles = (await collectTypeScriptFiles(typesDir)).filter(
    isGeneratorOwnedTypePath,
  );
  let prunedCount = 0;

  debug("expected type files: %o", Array.from(expectedFiles));
  debug("actual generated type files: %o", actualFiles);

  for (const file of actualFiles) {
    const normalizedFile = toForwardSlashPath(file);

    if (!expectedFiles.has(normalizedFile)) {
      const fullPath = nodePath.join(typesDir, file);

      debug("pruning %s", fullPath);
      await fs.rm(fullPath);
      prunedCount++;
    }
  }

  await removeEmptyDirectories(typesDir, typesDir);
  debug("pruned %d type files", prunedCount);

  return prunedCount;
}
