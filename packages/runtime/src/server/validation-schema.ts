/**
 * Dereferenced OpenAPI schemas may be cyclic JavaScript graphs. Ajv expects
 * JSON Schema references, so replace back edges with JSON Pointer references.
 * Cache by source identity just as Ajv caches compiled schemas.
 */
const cache = new WeakMap<object, Record<string, unknown>>();

export function validationSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const cached = cache.get(schema);
  if (cached) return cached;
  const ancestors = new Map<object, string>();
  function visit(value: unknown, pointer: string): unknown {
    if (typeof value !== "object" || value === null) return value;
    const target = ancestors.get(value);
    if (target !== undefined) return { $ref: target };
    ancestors.set(value, pointer);
    const result = Array.isArray(value)
      ? value.map((entry, index) => visit(entry, pointer + "/" + index))
      : Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [
            key,
            visit(
              entry,
              pointer + "/" + key.replaceAll("~", "~0").replaceAll("/", "~1"),
            ),
          ]),
        );
    ancestors.delete(value);
    return result;
  }
  const normalized = visit(schema, "#") as Record<string, unknown>;
  cache.set(schema, normalized);
  return normalized;
}
