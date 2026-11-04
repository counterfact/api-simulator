import type { MultipartFile } from "@counterfact/types";

type Schema = Record<string, unknown>;
const validationSchemas = new WeakMap<Schema, Schema>();

function asSchema(value: unknown): Schema | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Schema)
    : undefined;
}

export function isMultipartFile(value: unknown): value is MultipartFile {
  const file = asSchema(value);
  return (
    file !== undefined &&
    file.data instanceof Uint8Array &&
    typeof file.filename === "string" &&
    typeof file.contentType === "string" &&
    file.size === file.data.byteLength
  );
}

/** Decode only declared fields. Invalid values are left for request validation. */
export function normalizeMultipartBody(
  body: unknown,
  schema: unknown,
): unknown {
  const definition = asSchema(schema);
  if (!definition || isMultipartFile(body)) return body;
  const branches = definition.anyOf ?? definition.oneOf;
  if (Array.isArray(branches)) {
    const nonNull = branches.filter(
      (branch) => asSchema(branch)?.type !== "null",
    );
    if (nonNull.length === 1) return normalizeMultipartBody(body, nonNull[0]);
  }
  const type = Array.isArray(definition.type)
    ? definition.type.find((item) => item !== "null")
    : definition.type;
  if (type === "array") {
    const values = Array.isArray(body) ? body : [body];
    return values.map((value) =>
      normalizeMultipartBody(value, definition.items),
    );
  }
  if (
    typeof body === "string" &&
    ["object", "number", "integer", "boolean"].includes(type as string)
  ) {
    try {
      const decoded: unknown = JSON.parse(body);
      if (
        type === "object"
          ? asSchema(decoded) !== undefined
          : typeof decoded === (type === "integer" ? "number" : type)
      ) {
        body = decoded;
      }
    } catch {
      // Keep the original string so Ajv reports the declared type mismatch.
    }
  }
  const object = asSchema(body);
  const properties = asSchema(definition.properties);
  if (object && properties) {
    body = Object.fromEntries(
      Object.entries(object).map(([name, value]) => [
        name,
        normalizeMultipartBody(
          value,
          Object.hasOwn(properties, name) ? properties[name] : undefined,
        ),
      ]),
    );
  }
  if (Array.isArray(definition.allOf)) {
    for (const branch of definition.allOf)
      body = normalizeMultipartBody(body, branch);
  }
  return body;
}

/** Adapt file leaves without changing the loaded document or its JSON schemas. */
export function multipartValidationSchema(schema: unknown): unknown {
  const definition = asSchema(schema);
  if (!definition) return schema;
  const cached = validationSchemas.get(definition);
  if (cached) return cached;
  if (
    (definition.type === "string" && definition.format === "binary") ||
    definition.type === "file"
  ) {
    const file = { counterfactMultipartFile: true };
    const result =
      definition.nullable === true ? { anyOf: [file, { type: "null" }] } : file;
    validationSchemas.set(definition, result);
    return result;
  }
  const result = { ...definition };
  validationSchemas.set(definition, result);
  for (const keyword of [
    "properties",
    "patternProperties",
    "$defs",
    "definitions",
    "dependentSchemas",
  ]) {
    const children = asSchema(definition[keyword]);
    if (children)
      result[keyword] = Object.fromEntries(
        Object.entries(children).map(([name, child]) => [
          name,
          multipartValidationSchema(child),
        ]),
      );
  }
  for (const keyword of [
    "items",
    "prefixItems",
    "allOf",
    "anyOf",
    "oneOf",
    "not",
    "additionalProperties",
    "contains",
    "if",
    "then",
    "else",
  ]) {
    const child = definition[keyword];
    if (child !== undefined)
      result[keyword] = Array.isArray(child)
        ? child.map(multipartValidationSchema)
        : multipartValidationSchema(child);
  }
  return result;
}
