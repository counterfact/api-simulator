import { numericParameterValue } from "./numeric-parameter.js";
import { parameterType } from "./parameter-type.js";
import Ajv from "ajv";
import { validationSchema } from "./validation-schema.js";
import {
  isMultipartFile,
  multipartValidationSchema,
} from "./multipart-body.js";

import type { OpenApiOperation, OpenApiParameters } from "@counterfact/types";

const ajv = new Ajv({
  // Stop at the first body validation failure instead of collecting unbounded errors.
  allErrors: false,
  strict: false,
  coerceTypes: false,
  // Shared schema references must compile once, rather than expanding a DAG.
  inlineRefs: false,
});

ajv.addKeyword({
  keyword: "counterfactMultipartFile",
  validate: (_schema: boolean, data: unknown) => isMultipartFile(data),
  errors: false,
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
  const headerNamesWithValues =
    location === "header"
      ? new Set(
          Object.entries(values)
            .filter(([, value]) => value !== undefined)
            .map(([name]) => name.toLowerCase()),
        )
      : undefined;

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

      if (headerNamesWithValues !== undefined) {
        return !headerNamesWithValues.has(p.name.toLowerCase());
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

  // Validate numeric spellings before registry coercion can lose information.
  for (const parameter of parameters) {
    if (
      parameter.in !== "query" ||
      !Object.hasOwn(request.query, parameter.name)
    )
      continue;
    const type = parameter.type ?? parameterType(parameter.schema);
    if (type !== "integer" && type !== "number") continue;
    const raw = request.query[parameter.name];
    if (raw === undefined) continue;
    const value = numericParameterValue(raw, type);
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (type === "integer" && !Number.isInteger(value))
    ) {
      errors.push(
        "query parameter '" + parameter.name + "' must be a finite " + type,
      );
    }
  }

  // Boolean wire values are case-sensitive. Never turn malformed text into false.
  for (const parameter of parameters) {
    if ((parameter.type ?? parameter.schema?.type) !== "boolean") continue;
    const values =
      parameter.in === "query"
        ? request.query
        : parameter.in === "header"
          ? Object.fromEntries(
              Object.entries(request.headers).map(([key, value]) => [
                key.toLowerCase(),
                value,
              ]),
            )
          : parameter.in === "cookie"
            ? request.cookie
            : undefined;
    const name =
      parameter.in === "header" ? parameter.name.toLowerCase() : parameter.name;
    const value =
      // eslint-disable-next-line security/detect-object-injection -- The own-property check excludes inherited values for absent request parameters.
      values && Object.hasOwn(values, name) ? values[name] : undefined;
    if (
      value !== undefined &&
      value !== true &&
      value !== false &&
      value !== "true" &&
      value !== "false"
    ) {
      errors.push(
        parameter.in +
          " parameter '" +
          parameter.name +
          "' must be true or false",
      );
    }
  }

  // Validate request body (OpenAPI 3.x requestBody)
  if (operation.requestBody?.content !== undefined) {
    const contentType = (
      request.headers["content-type"] ??
      request.headers["Content-Type"] ??
      ""
    )
      .split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    const content = operation.requestBody.content;
    const declared = contentType
      ? [contentType, contentType.split("/")[0] + "/*", "*/*"].find((type) =>
          Object.hasOwn(content, type),
        )
      : undefined;
    const selected = contentType
      ? declared === undefined
        ? undefined
        : // eslint-disable-next-line security/detect-object-injection -- declared was selected from Object.keys(content) by normalized content type.
          content[declared]?.schema
      : (content["application/json"]?.schema ??
        content["application/x-www-form-urlencoded"]?.schema ??
        content["multipart/form-data"]?.schema);
    if (contentType && declared === undefined && request.body !== undefined)
      errors.push("body content type is not declared: " + contentType);
    const schema =
      contentType === "multipart/form-data"
        ? multipartValidationSchema(selected)
        : selected;

    if (request.body === undefined) {
      if (operation.requestBody.required === true)
        errors.push("body is required");
    } else if (schema !== undefined) {
      const valid = ajv.validate(
        validationSchema(
          schema as Record<string, unknown> | boolean,
          ajv.opts.uriResolver.resolve,
        ),
        request.body,
      );

      if (!valid && ajv.errors) {
        for (const error of ajv.errors) {
          const path = error.instancePath ?? "";

          errors.push(`body${path} ${error.message ?? "is invalid"}`);
        }
      }
    }
  }

  // Validate request body (OpenAPI 2.x body parameter)
  const bodyParam = parameters.find((p) => p.in === "body");

  if (bodyParam && request.body === undefined) {
    if (bodyParam.required === true) errors.push("body is required");
  } else if (bodyParam?.schema !== undefined) {
    const valid = ajv.validate(
      validationSchema(bodyParam.schema, ajv.opts.uriResolver.resolve),
      request.body,
    );

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
