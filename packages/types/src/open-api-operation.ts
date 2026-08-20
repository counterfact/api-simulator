import type { Example } from "./example.js";
import type { OpenApiHeader } from "./open-api-header.js";
import type { OpenApiParameters } from "./open-api-parameters.js";

/**
 * Describes a single HTTP operation (e.g. `GET /pets`) as defined in an
 * OpenAPI document. Used internally to derive the strongly-typed argument
 * and response builder types for generated route handler functions.
 */
export interface OpenApiOperation {
  parameters?: OpenApiParameters[];
  produces?: string[];
  requestBody?: {
    content?: {
      [mediaType: string]: {
        schema: { [key: string]: unknown };
      };
    };
    required?: boolean;
  };
  responses: {
    [status: string]: {
      content?: {
        [type: number | string]: {
          examples?: { [key: string]: Example };
          schema: { [key: string]: unknown };
        };
      };
      examples?: { [key: string]: unknown };
      headers?: {
        [name: string]: OpenApiHeader;
      };
      schema?: { [key: string]: unknown };
    };
  };
}
