import type { GenericResponseBuilder } from "./generic-response-builder.js";
import type { OpenApiResponses } from "./open-api-response.js";

/**
 * Maps each HTTP status code (or `"default"`) in an OpenAPI operation's
 * response definitions to the corresponding `GenericResponseBuilder`.
 * This is the type of the `response` property in a generated route handler's
 * argument object, allowing handlers to call e.g. `response[200].json(body)`.
 */
export type ResponseBuilderFactory<
  Responses extends OpenApiResponses = OpenApiResponses,
> = {
  [StatusCode in keyof Responses]: GenericResponseBuilder<
    Responses[StatusCode]
  >;
} & { [key: string]: GenericResponseBuilder<Responses["default"]> };
