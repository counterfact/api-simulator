/**
 * Normalizes an OpenAPI path for Counterfact's route and type module trees.
 *
 * Incoming requests already match route modules with or without a terminal
 * slash, so terminal slashes must not create an extra empty file segment.
 */
export function normalizeOpenApiPath(openApiPath: string): string {
  return openApiPath.replace(/\/+$/u, "") || "/";
}

function assertValidOpenApiPath(openApiPath: string): void {
  const normalizedPath = normalizeOpenApiPath(openApiPath);
  const invalidReason = invalidOpenApiPathReason(normalizedPath);

  if (invalidReason !== undefined) {
    throw new Error(
      `Invalid OpenAPI path ${JSON.stringify(openApiPath)}: ${invalidReason}.`,
    );
  }
}

function invalidOpenApiPathReason(openApiPath: string): string | undefined {
  if (!openApiPath.startsWith("/")) {
    return "paths must begin with a forward slash";
  }

  if (openApiPath.includes("\0")) {
    return "paths must not contain NUL characters";
  }

  if (openApiPath.includes("\\")) {
    return "paths must use forward slashes only";
  }

  const segments = openApiPath.split("/").slice(1);

  if (openApiPath !== "/" && segments.some((segment) => segment === "")) {
    return "paths must not contain empty internal segments";
  }

  if (segments.some((segment) => segment === "." || segment === "..")) {
    return 'paths must not contain "." or ".." segments';
  }

  return undefined;
}

/**
 * Rejects path keys that would target the same generated route module.
 */
export function assertNoNormalizedPathCollisions(
  openApiPaths: Iterable<string>,
): void {
  const originalPathByNormalizedPath = new Map<string, string>();

  for (const openApiPath of openApiPaths) {
    assertValidOpenApiPath(openApiPath);
    const normalizedPath = normalizeOpenApiPath(openApiPath);
    const existingPath = originalPathByNormalizedPath.get(normalizedPath);

    if (existingPath !== undefined && existingPath !== openApiPath) {
      throw new Error(
        `OpenAPI paths "${existingPath}" and "${openApiPath}" normalize to the same path "${normalizedPath}". Remove one of the conflicting paths.`,
      );
    }

    originalPathByNormalizedPath.set(normalizedPath, openApiPath);
  }
}
