import type { OpenApiResponse } from "./open-api-response.js";

/**
 * Extracts the union of named example keys defined on an OpenAPI response.
 * Resolves to `never` when the response has no named examples.
 * Used to constrain the argument to the `.example(name)` method on the
 * response builder.
 */
export type ExampleNames<Response extends OpenApiResponse> = Response extends {
  examples: infer E;
}
  ? keyof E & string
  : never;
