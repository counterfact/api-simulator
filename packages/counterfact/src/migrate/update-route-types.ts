import { promises as fs } from "node:fs";
import path from "node:path";
/* eslint-disable security/detect-non-literal-fs-filename -- migration reads/writes discovered route files under the configured basePath/routes tree. */

import ts from "typescript";
import createDebug from "debug";
import { buildOperationTypeNameMapping } from "@counterfact/generator";

import { toForwardSlashPath } from "../util/forward-slash-path.js";

const debug = createDebug("counterfact:migrate:update-route-types");

/** Rename only bindings imported from generated path type modules. */
async function updateRouteFile(
  filePath: string,
  methodToTypeName: Map<string, string>,
): Promise<boolean> {
  const content = await fs.readFile(filePath, "utf8");
  // TypeScript normalizes requested filenames to forward slashes on Windows.
  const sourcePath = toForwardSlashPath(filePath);
  const source = ts.createSourceFile(
    sourcePath,
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  const host = ts.createCompilerHost({ noLib: true });
  host.getSourceFile = (name) => (name === sourcePath ? source : undefined);
  const program = ts.createProgram(
    [sourcePath],
    { noLib: true, noResolve: true },
    host,
  );
  const checker = program.getTypeChecker();
  const replacements = new Map<string, string>();
  for (const [method, oldName] of methodToTypeName) {
    const newName = `HTTP_${method}`;
    for (const suffix of ["", "_Query", "_Path", "_Headers", "_Cookie"]) {
      if (oldName !== newName)
        replacements.set(`${oldName}${suffix}`, `${newName}${suffix}`);
    }
  }
  const edits = new Map<number, { end: number; text: string }>();
  const edit = (node: ts.Node, text: string): void => {
    edits.set(node.getStart(source), { end: node.end, text });
  };
  const identifiers = new Set<string>();
  const collect = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) identifiers.add(node.text);
    ts.forEachChild(node, collect);
  };
  collect(source);
  // Only imports from this route's generated types are eligible.
  const expectedModule = toForwardSlashPath(filePath)
    .replace("/routes/", "/types/paths/")
    .replace(/\.ts$/u, ".types");
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    )
      continue;
    const resolvedModule = toForwardSlashPath(
      path.resolve(path.dirname(filePath), statement.moduleSpecifier.text),
    ).replace(/\.(?:ts|js)$/u, "");
    if (resolvedModule !== expectedModule) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) {
      const namespace = checker.getSymbolAtLocation(bindings.name);
      const renameMembers = (node: ts.Node): void => {
        if (
          ts.isQualifiedName(node) &&
          checker.getSymbolAtLocation(node.left) === namespace
        ) {
          const newName = replacements.get(node.right.text);
          if (newName) edit(node.right, newName);
        }
        ts.forEachChild(node, renameMembers);
      };
      if (namespace) renameMembers(source);
      continue;
    }
    for (const binding of bindings.elements) {
      const imported = binding.propertyName ?? binding.name;
      const newName = replacements.get(imported.text);
      if (!newName) continue;
      if (binding.propertyName) {
        edit(imported, newName);
      } else if (identifiers.has(newName)) {
        // Preserve the local binding when the stable name would collide.
        edit(imported, `${newName} as ${binding.name.text}`);
      } else {
        const symbol = checker.getSymbolAtLocation(binding.name);
        if (!symbol) continue;
        const rename = (node: ts.Node): void => {
          if (
            ts.isIdentifier(node) &&
            checker.getSymbolAtLocation(node) === symbol
          )
            edit(node, newName);
          ts.forEachChild(node, rename);
        };
        rename(source);
        identifiers.add(newName);
      }
    }
  }
  let updated = content;
  for (const [start, change] of [...edits].sort(
    ([left], [right]) => right - left,
  )) {
    updated = updated.slice(0, start) + change.text + updated.slice(change.end);
  }
  if (updated === content) return false;
  await fs.writeFile(filePath, updated, "utf8");
  return true;
}

/**
 * Recursively processes route files in a directory
 * @param routesDir - Path to routes directory
 * @param currentPath - Current subdirectory being processed
 * @param mapping - Type name mapping
 * @returns Number of files updated
 */
async function processRouteDirectory(
  routesDir: string,
  currentPath: string,
  mapping: Map<string, Map<string, string>>,
): Promise<number> {
  let updatedCount = 0;

  try {
    const entries = await fs.readdir(path.join(routesDir, currentPath), {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const relativePath = path.join(currentPath, entry.name);
      const absolutePath = path.join(routesDir, relativePath);

      if (entry.isDirectory()) {
        // Recursively process subdirectories
        updatedCount += await processRouteDirectory(
          routesDir,
          relativePath,
          mapping,
        );
      } else if (entry.name.endsWith(".ts") && entry.name !== "_.context.ts") {
        // Process TypeScript route files (skip context files)
        const routePath = toForwardSlashPath(relativePath.replace(/\.ts$/, ""));
        const methodMap = mapping.get(routePath);

        if (methodMap) {
          const wasUpdated = await updateRouteFile(absolutePath, methodMap);
          if (wasUpdated) {
            updatedCount++;
          }
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      debug("error processing directory %s: %o", currentPath, error);
    }
  }

  return updatedCount;
}

/**
 * Main migration function - updates route type imports to use new naming convention
 * @param basePath - Base path where routes and types are located
 * @param openApiPath - Path or URL to OpenAPI specification
 * @returns True if migration was performed
 */
export async function updateRouteTypes(
  basePath: string,
  openApiPath: string,
  overlays: readonly string[] = [],
): Promise<boolean> {
  debug("starting route type migration for base path: %s", basePath);

  // Skip if running without OpenAPI spec
  if (openApiPath === "_") {
    debug("skipping migration - no OpenAPI spec provided");
    return false;
  }

  const routesDir = path.join(basePath, "routes");

  try {
    // Check if routes directory exists
    await fs.access(routesDir);
  } catch {
    debug("routes directory does not exist: %s", routesDir);
    return false;
  }

  try {
    // Build the mapping of paths to type names
    const mapping = await buildOperationTypeNameMapping(
      openApiPath,
      overlays,
      true,
    );

    if (mapping.size === 0) {
      debug("no routes found in specification");
      return false;
    }

    // Process all route files
    debug("processing route files in: %s", routesDir);
    const updatedCount = await processRouteDirectory(routesDir, "", mapping);

    debug("migration complete - updated %d files", updatedCount);
    return updatedCount > 0;
  } catch (error) {
    debug("error during migration: %o", error);
    process.stderr.write(
      `Warning: Could not migrate route types: ${(error as Error).message}\n`,
    );
    return false;
  }
}
