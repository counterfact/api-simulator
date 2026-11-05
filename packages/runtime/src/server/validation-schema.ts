type Schema = Record<string, unknown> | boolean;
type ResolveUri = (base: string, reference: string) => string;
const cache = new WeakMap<object, Record<string, unknown>>();
let sequence = 0;
const maps = new Set([
  "properties",
  "patternProperties",
  "$defs",
  "definitions",
  "dependentSchemas",
]);
const children = new Set([
  "items",
  "prefixItems",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "additionalProperties",
  "additionalItems",
  "contains",
  "if",
  "then",
  "else",
  "propertyNames",
  "unevaluatedProperties",
  "unevaluatedItems",
  "contentSchema",
]);
const token = (key: string) =>
  encodeURIComponent(key.replaceAll("~", "~0").replaceAll("/", "~1"));

/** Convert schema graph cycles into URI references within the correct $id resource. */
export function validationSchema(
  schema: Schema,
  resolveUri: ResolveUri,
): Schema {
  if (typeof schema === "boolean") return schema;
  const cached = cache.get(schema);
  if (cached) return cached;
  const base = "https://counterfact.invalid/request-schema/" + ++sequence;
  const ancestors = new Map<object, { resource: string; pointer: string }>();
  const resources = new Map<string, object>();
  function visit(value: unknown, pointer: string, resource: string): unknown {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return value;
    const target = ancestors.get(value);
    if (target)
      return {
        $ref:
          target.resource === resource
            ? target.pointer
            : target.resource + target.pointer,
      };
    const source = value as Record<string, unknown>;
    const id =
      typeof source.$id === "string"
        ? resolveUri(resource, source.$id)
        : undefined;
    if (id !== undefined) {
      if (resources.get(id) === value) return { $ref: id };
      resource = id;
      pointer = "#";
      resources.set(id, value);
    }
    ancestors.set(value, { resource, pointer });
    const result: Record<string, unknown> = { ...source };
    if (id !== undefined) result.$id = id;
    for (const [key, child] of Object.entries(source)) {
      const path = pointer + "/" + token(key);
      if (
        maps.has(key) &&
        typeof child === "object" &&
        child !== null &&
        !Array.isArray(child)
      ) {
        result[key] = Object.fromEntries(
          Object.entries(child).map(([name, node]) => [
            name,
            visit(node, path + "/" + token(name), resource),
          ]),
        );
      } else if (children.has(key)) {
        result[key] = Array.isArray(child)
          ? child.map((node, index) =>
              visit(node, path + "/" + index, resource),
            )
          : visit(child, path, resource);
      }
    }
    ancestors.delete(value);
    return result;
  }
  const normalized = visit(schema, "#", base) as Record<string, unknown>;
  normalized.$id ??= base;
  cache.set(schema, normalized);
  return normalized;
}
