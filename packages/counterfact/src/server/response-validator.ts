import Ajv from "ajv";

import type { OpenApiOperation } from "../counterfact-types/index.js";
import type { CounterfactResponseObject } from "./registry.js";

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  coerceTypes: false,
});

export interface ResponseValidationResult {
  errors: string[];
  valid: boolean;
}

export function validateResponse(
  operation: OpenApiOperation | undefined,
  response: CounterfactResponseObject,
): ResponseValidationResult {
  if (!operation) {
    return { errors: [], valid: true };
  }

  const errors: string[] = [];

  const statusKey =
    response.status !== undefined ? String(response.status) : undefined;

  const responseSpec =
    (statusKey !== undefined ? operation.responses[statusKey] : undefined) ??
    operation.responses.default;

  if (!responseSpec) {
    return { errors: [], valid: true };
  }

  const specHeaders = responseSpec.headers ?? {};
  const actualHeaders = response.headers ?? {};

  for (const [name, headerSpec] of Object.entries(specHeaders)) {
    const actualValue =
      actualHeaders[name] ?? actualHeaders[name.toLowerCase()];

    if (headerSpec.required === true && actualValue === undefined) {
      errors.push(`response header '${name}' is required`);
      continue;
    }

    if (actualValue !== undefined && headerSpec.schema !== undefined) {
      const coercedValue =
        typeof actualValue === "string"
          ? coerceHeaderValue(actualValue, headerSpec.schema)
          : actualValue;

      const valid = ajv.validate(headerSpec.schema, coercedValue);

      if (!valid && ajv.errors) {
        for (const error of ajv.errors) {
          const path = error.instancePath ?? "";

          errors.push(
            `response header '${name}'${path} ${error.message ?? "is invalid"}`,
          );
        }
      }
    }
  }

  return {
    errors,
    valid: errors.length === 0,
  };
}

function coerceHeaderValue(
  value: string,
  schema: { [key: string]: unknown },
): unknown {
  const type = schema.type as string | undefined;

  if (type === "integer" || type === "number") {
    const num = Number(value);

    return Number.isNaN(num) ? value : num;
  }

  if (type === "boolean") {
    if (value === "true") return true;
    if (value === "false") return false;

    return value;
  }

  return value;
}
