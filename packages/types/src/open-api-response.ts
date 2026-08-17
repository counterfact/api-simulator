import type { MediaType } from "./media-type.js";
import type { OpenApiContent } from "./open-api-content.js";

/**
 * Describes a single HTTP response as modelled in an OpenAPI document.
 * Contains the allowed content types, optional named examples, and the
 * required/optional response headers for that response.
 */
export interface OpenApiResponse {
  content: { [key: MediaType]: OpenApiContent };
  examples?: { [key: string]: unknown };
  headers: { [key: string]: { schema: unknown } };
  requiredHeaders: string;
}

/**
 * A map of HTTP status codes (or `"default"`) to their corresponding
 * `OpenApiResponse` definitions for a given operation.
 */
export interface OpenApiResponses {
  [key: string]: OpenApiResponse;
}
