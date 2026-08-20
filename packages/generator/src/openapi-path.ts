/**
 * Normalizes an OpenAPI path for Counterfact's route and type module trees.
 *
 * Incoming requests already match route modules with or without a terminal
 * slash, so terminal slashes must not create an extra empty file segment.
 */
export function normalizeOpenApiPath(openApiPath: string): string {
  return openApiPath.replace(/\/+$/u, "") || "/";
}

/**
 * Rejects path keys that would target the same generated route module.
 */
export function assertNoNormalizedPathCollisions(
  openApiPaths: Iterable<string>,
): void {
  const originalPathByNormalizedPath = new Map<string, string>();

  for (const openApiPath of openApiPaths) {
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
