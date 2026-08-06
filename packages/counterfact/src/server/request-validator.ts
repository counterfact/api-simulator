import Ajv from "ajv";

import type {
  OpenApiOperation,
  OpenApiParameters,
} from "../counterfact-types/index.js";

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  coerceTypes: false,
});

export interface ValidationResult {
  errors: string[];
  valid: boolean;
}

/**
 * Returns `true` when a query parameter should be serialized as exploded form
 * style — meaning its object properties appear as individual query parameters
 * instead of being passed under the parameter's own name.
 *
 * Per OpenAPI 3.x: for `in: query`, the default `style` is `form` and the
 * default `explode` for `form` is `true`.  An object-type parameter with these
 * defaults (or with them set explicitly) uses exploded form serialization.
 */
export function isExplodedObjectQueryParam(
  parameter: OpenApiParameters,
): boolean {
  if (parameter.in !== "query") return false;

  const schema = parameter.schema;
  if (!schema) return false;

  // Must be an object type (explicit type or implied by presence of properties)
  const isObjectType =
    schema.type === "object" || schema.properties !== undefined;
  if (!isObjectType) return false;

  // style must be "form" (the default for query params) or unset
  if (parameter.style !== undefined && parameter.style !== "form") return false;

  // explode must not be explicitly false (default for form style is true)
  if (parameter.explode === false) return false;

  return true;
}

function findMissingRequired(
  parameters: NonNullable<OpenApiOperation["parameters"]>,
  location: string,
  values: Record<string, string | string[] | unknown>,
): string[] {
  return parameters
    .filter((p) => p.in === location && p.required === true)
    .filter((p) => {
      // For exploded object query params the individual properties appear as
      // separate query parameters, so we check for those instead of the name.
      if (location === "query" && isExplodedObjectQueryParam(p)) {
        const properties = p.schema?.properties;
        if (!properties) {
          // Free-form object with no declared properties: treat as always
          // satisfied — we cannot know which keys belong to the parameter.
          return false;
        }
        // The parameter is "missing" only when none of its properties are present.
        return !Object.keys(properties).some((key) => key in values);
      }
      return !(p.name in values) || values[p.name] === undefined;
    })
    .map((p) => `${location} parameter '${p.name}' is required`);
}

export function validateRequest(
  operation: OpenApiOperation | undefined,
  request: {
    body: unknown;
    cookie: Record<string, string>;
    headers: Record<string, string>;
    query: Record<string, unknown>;
  },
): ValidationResult {
  if (!operation) {
    return { errors: [], valid: true };
  }

  const errors: string[] = [];
  const parameters = operation.parameters ?? [];

  // For query and header parameters, HTTP always delivers values as strings.
  // Only check that required parameters are present; type coercion is handled
  // by the registry before the route handler is called.
  errors.push(...findMissingRequired(parameters, "query", request.query));
  errors.push(...findMissingRequired(parameters, "header", request.headers));
  errors.push(...findMissingRequired(parameters, "cookie", request.cookie));

  // Validate request body (OpenAPI 3.x requestBody)
  if (operation.requestBody?.content !== undefined) {
    const schema =
      operation.requestBody.content["application/json"]?.schema ??
      operation.requestBody.content["application/x-www-form-urlencoded"]
        ?.schema;

    if (schema !== undefined) {
      const valid = ajv.validate(schema, request.body);

      if (!valid && ajv.errors) {
        for (const error of ajv.errors) {
          const path = error.instancePath ?? "";

          errors.push(`body${path} ${error.message ?? "is invalid"}`);
        }
      }
    } else if (operation.requestBody.required === true && !request.body) {
      errors.push("body is required");
    }
  }

  // Validate request body (OpenAPI 2.x body parameter)
  const bodyParam = parameters.find((p) => p.in === "body");

  if (bodyParam?.schema !== undefined) {
    const valid = ajv.validate(bodyParam.schema, request.body);

    if (!valid && ajv.errors) {
      for (const error of ajv.errors) {
        const path = error.instancePath ?? "";

        errors.push(`body${path} ${error.message ?? "is invalid"}`);
      }
    }
  }

  return {
    errors,
    valid: errors.length === 0,
  };
}
