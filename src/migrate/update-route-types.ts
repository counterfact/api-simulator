import { promises as fs } from "node:fs";
import path from "node:path";
/* eslint-disable security/detect-non-literal-fs-filename -- migration reads/writes discovered route files under the configured basePath/routes tree. */

import createDebug from "debug";

import { toForwardSlashPath } from "../util/forward-slash-path.js";
import {
  OperationTypeCoder,
  type SecurityScheme,
} from "../typescript-generator/operation-type-coder.js";
import { Specification } from "../typescript-generator/specification.js";

const debug = createDebug("counterfact:migrate:update-route-types");

const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
  "QUERY",
] as const;

type HttpMethod = (typeof HTTP_METHODS)[number];

// Pre-compile regex patterns derived from HTTP_METHODS
const HTTP_METHOD_ALTERNATION = HTTP_METHODS.join("|");

// eslint-disable-next-line security/detect-non-literal-regexp
const NEEDS_MIGRATION_REGEX = new RegExp(
  `import\\s+type\\s+\\{[^}]*HTTP_(?:${HTTP_METHOD_ALTERNATION})[^}]*\\}`,
  "iu",
);

// eslint-disable-next-line security/detect-non-literal-regexp
const HTTP_TYPE_NAME_REGEX = new RegExp(
  `^HTTP_(?<method>${HTTP_METHOD_ALTERNATION})$`,
  "u",
);

// Pre-build import/export replacement patterns for each HTTP method type name
const IMPORT_REPLACE_PATTERNS = new Map(
  HTTP_METHODS.map((method) => [
    `HTTP_${method}`,
    // eslint-disable-next-line security/detect-non-literal-regexp
    new RegExp(
      `(import\\s+type\\s+\\{[^}]*\\b)HTTP_${method}(\\b[^}]*\\}\\s+from)`,
      "g",
    ),
  ]),
);

const EXPORT_REPLACE_PATTERNS = new Map(
  HTTP_METHODS.map((method) => [
    `HTTP_${method}`,
    // eslint-disable-next-line security/detect-non-literal-regexp
    new RegExp(
      `(export\\s+const\\s+${method}\\s*:\\s*)HTTP_${method}(\\b)`,
      "g",
    ),
  ]),
);

/**
 * Converts an OpenAPI path to a file system path
 * e.g., "/hello/{name}" -> "hello/{name}"
 */
function openApiPathToFilePath(openApiPath: string): string {
  if (openApiPath === "/") {
    return "index";
  }
  return openApiPath.startsWith("/") ? openApiPath.slice(1) : openApiPath;
}

/**
 * Builds a mapping of route file paths to their operation type names per method
 * @param specification - The OpenAPI specification
 * @returns Map of filePath -> Map of method -> typeName
 */
async function buildTypeNameMapping(
  specification: Specification,
): Promise<Map<string, Map<string, string>>> {
  debug("building type name mapping from specification");

  const mapping = new Map<string, Map<string, string>>();

  try {
    const paths = specification.getRequirement("#/paths");

    if (!paths) {
      debug("no paths found in specification");
      return mapping;
    }

    const securityRequirement = specification.getRequirement(
      "#/components/securitySchemes",
    );
    const securitySchemes = Object.values(
      (securityRequirement?.data as Record<string, unknown>) ?? {},
    ) as SecurityScheme[];

    paths.forEach((pathDefinition, openApiPath: string) => {
      const filePath = openApiPathToFilePath(openApiPath);
      const methodMap = new Map<string, string>();

      pathDefinition.forEach((operation, requestMethod: string) => {
        // Skip if not a standard HTTP method
        if (!HTTP_METHODS.includes(requestMethod.toUpperCase() as HttpMethod)) {
          return;
        }

        // Create the type coder to get the correct type name
        const typeCoder = new OperationTypeCoder(
          operation,
          "",
          requestMethod,
          securitySchemes,
        );

        // Get the type name (first from the names generator)
        const typeName = typeCoder.names().next().value as string;

        methodMap.set(requestMethod.toUpperCase(), typeName);

        debug(
          "mapped %s %s -> %s",
          requestMethod.toUpperCase(),
          openApiPath,
          typeName,
        );
      });

      if (methodMap.size > 0) {
        mapping.set(filePath, methodMap);
      }
    });

    debug("built mapping for %d routes", mapping.size);
  } catch (error) {
    debug("error building type name mapping: %o", error);
    throw error;
  }

  return mapping;
}

/**
 * Checks if a route file needs migration by looking for old-style HTTP_ imports
 * @param content - The file content
 */
function needsMigration(content: string): boolean {
  return NEEDS_MIGRATION_REGEX.test(content);
}

/**
 * Updates a single route file with the correct type names
 * @param filePath - Absolute path to the route file
 * @param methodToTypeName - Map of HTTP method to type name
 * @returns True if file was updated
 */
async function updateRouteFile(
  filePath: string,
  methodToTypeName: Map<string, string>,
): Promise<boolean> {
  debug("processing route file: %s", filePath);

  let content = await fs.readFile(filePath, "utf8");

  // Check if migration is needed
  if (!needsMigration(content)) {
    debug("file does not need migration: %s", filePath);
    return false;
  }

  let modified = false;

  // Build a map of old type names to new type names found in this file
  const replacements = new Map<string, string>();

  // Find all import statements with HTTP_ patterns
  const importRegex =
    /import\s+type\s+\{(?<types>[^}]+)\}\s+from\s+["'][^"']+["'];?/gu;
  let importMatch;

  while ((importMatch = importRegex.exec(content)) !== null) {
    const importedTypes = (importMatch.groups?.["types"] ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    for (const importedType of importedTypes) {
      // Check if this is an HTTP_ type
      const httpMethodMatch = importedType.match(HTTP_TYPE_NAME_REGEX);

      if (httpMethodMatch) {
        const method = httpMethodMatch.groups?.["method"] ?? "";
        const newTypeName = methodToTypeName.get(method);

        if (newTypeName && newTypeName !== importedType) {
          replacements.set(importedType, newTypeName);
          debug("will replace %s with %s", importedType, newTypeName);
        }
      }
    }
  }

  if (replacements.size === 0) {
    debug("no replacements needed for: %s", filePath);
    return false;
  }

  // Apply replacements
  for (const [oldName, newName] of replacements.entries()) {
    // Replace in import statement
    const importPattern = IMPORT_REPLACE_PATTERNS.get(oldName);
    if (importPattern) {
      importPattern.lastIndex = 0;
      content = content.replace(importPattern, `$1${newName}$2`);
    }

    // Replace in export statement (e.g., "export const GET: HTTP_GET")
    // Match the method from the old type name
    const methodMatch = oldName.match(HTTP_TYPE_NAME_REGEX);
    if (methodMatch) {
      const exportPattern = EXPORT_REPLACE_PATTERNS.get(oldName);
      if (exportPattern) {
        exportPattern.lastIndex = 0;
        content = content.replace(exportPattern, `$1${newName}$2`);
      }
    }

    modified = true;
  }

  if (modified) {
    await fs.writeFile(filePath, content, "utf8");
    debug("updated file: %s", filePath);
  }

  return modified;
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
 * Checks if any route files need migration
 * @param routesDir - Path to routes directory
 */
async function checkIfMigrationNeeded(routesDir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(routesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.endsWith(".ts") && entry.name !== "_.context.ts") {
        const content = await fs.readFile(
          path.join(routesDir, entry.name),
          "utf8",
        );

        if (needsMigration(content)) {
          return true;
        }
      } else if (entry.isDirectory() && entry.name !== "node_modules") {
        // Recursively check subdirectories
        const subDirPath = path.join(routesDir, entry.name);
        const found = await checkIfMigrationNeeded(subDirPath);
        if (found) {
          return true;
        }
      }
    }
  } catch (error) {
    debug("error checking for migration need: %o", error);
  }

  return false;
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

  // Quick check if migration is needed
  const migrationNeeded = await checkIfMigrationNeeded(routesDir);

  if (!migrationNeeded) {
    debug("no migration needed - no old-style HTTP_ imports found");
    return false;
  }

  try {
    // Load the OpenAPI specification
    debug("loading OpenAPI specification from: %s", openApiPath);
    const specification = await Specification.fromFile(openApiPath);

    // Build the mapping of paths to type names
    const mapping = await buildTypeNameMapping(specification);

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
