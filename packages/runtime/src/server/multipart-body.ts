import Ajv from "ajv";
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

const normalizationAjv = new Ajv({
  allErrors: false,
  strict: false,
  coerceTypes: false,
});
normalizationAjv.addKeyword({
  keyword: "counterfactMultipartFile",
  validate: (_schema: boolean, data: unknown) => isMultipartFile(data),
  errors: false,
});

/** Decode declared fields, preserving already-valid unions and oneOf exclusivity. */
export function normalizeMultipartBody(
  body: unknown,
  schema: unknown,
): unknown {
  const definition = asSchema(schema);
  if (!definition) return body;
  const types = Array.isArray(definition.type)
    ? definition.type.filter((type) => type !== "null")
    : [definition.type];
  const type = types.length === 1 ? types[0] : undefined;
  const objectType =
    type === "object" ||
    (type === undefined &&
      (definition.properties !== undefined ||
        definition.additionalProperties !== undefined));
  if (type === "array") {
    body = (Array.isArray(body) ? body : [body]).map((value) =>
      normalizeMultipartBody(value, definition.items),
    );
  } else if (
    typeof body === "string" &&
    (objectType || ["number", "integer", "boolean"].includes(type as string))
  ) {
    try {
      const decoded: unknown = JSON.parse(body);
      if (
        objectType
          ? asSchema(decoded) !== undefined
          : typeof decoded === (type === "integer" ? "number" : type)
      )
        body = decoded;
    } catch {
      /* Preserve invalid wire text for request validation. */
    }
  }
  const object = asSchema(body),
    properties = asSchema(definition.properties);
  if (object && properties)
    body = Object.fromEntries(
      Object.entries(object).map(([name, value]) => [
        name,
        normalizeMultipartBody(
          value,
          // eslint-disable-next-line security/detect-object-injection -- The own-property check limits this lookup to declared property schemas.
          Object.hasOwn(properties, name) ? properties[name] : undefined,
        ),
      ]),
    );
  if (Array.isArray(definition.allOf))
    for (const branch of definition.allOf)
      body = normalizeMultipartBody(body, branch);
  const branches = definition.anyOf ?? definition.oneOf;
  if (Array.isArray(branches)) {
    const adapted = multipartValidationSchema(definition) as object | boolean;
    if (normalizationAjv.validate(adapted, body)) return body;
    for (const branch of branches) {
      const candidate = normalizeMultipartBody(body, branch);
      if (normalizationAjv.validate(adapted, candidate)) return candidate;
    }
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
    ((definition.type === "string" ||
      (Array.isArray(definition.type) && definition.type.includes("string"))) &&
      definition.format === "binary") ||
    definition.type === "file"
  ) {
    const file = { counterfactMultipartFile: true };
    const otherTypes = Array.isArray(definition.type)
      ? definition.type.filter((type) => type !== "string")
      : [];
    if (definition.nullable === true && !otherTypes.includes("null"))
      otherTypes.push("null");
    const result = otherTypes.length
      ? { anyOf: [file, { type: otherTypes }] }
      : file;
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
    // eslint-disable-next-line security/detect-object-injection -- keyword comes from the fixed JSON Schema keyword list in this loop.
    const children = asSchema(definition[keyword]);
    if (children)
      // eslint-disable-next-line security/detect-object-injection -- keyword comes from the fixed JSON Schema keyword list in this loop.
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
    // eslint-disable-next-line security/detect-object-injection -- keyword comes from the fixed JSON Schema keyword list in this loop.
    const child = definition[keyword];
    if (child !== undefined)
      // eslint-disable-next-line security/detect-object-injection -- keyword comes from the fixed JSON Schema keyword list in this loop.
      result[keyword] = Array.isArray(child)
        ? child.map(multipartValidationSchema)
        : multipartValidationSchema(child);
  }
  return result;
}
