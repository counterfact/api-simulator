import Ajv from "ajv";

import type { OpenApiOperation } from "@counterfact/types";
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

  // The HTTP layer sends 200 when a handler omits status. Validate against the
  // same effective status so an implicit success response cannot bypass its
  // OpenAPI response contract.
  const statusKey = String(response.status ?? 200);

  const responseSpec =
    operation.responses[statusKey] ?? operation.responses.default;

  if (!responseSpec) {
    return { errors: [], valid: true };
  }

  const specHeaders = responseSpec.headers ?? {};
  const actualHeaders = response.headers ?? {};
  const actualHeadersByLowercaseName = new Map(
    Object.entries(actualHeaders).map(([name, value]) => [
      name.toLowerCase(),
      value,
    ]),
  );

  for (const [name, headerSpec] of Object.entries(specHeaders)) {
    const actualValue = actualHeadersByLowercaseName.get(name.toLowerCase());

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
