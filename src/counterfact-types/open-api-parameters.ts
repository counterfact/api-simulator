/**
 * Describes a single parameter (path, query, header, cookie, body, or
 * formData) as defined in an OpenAPI document. Used internally to type the
 * `path`, `query`, `headers`, and `body` properties of a route handler's
 * argument object.
 */
export interface OpenApiParameters {
  explode?: boolean;
  in:
    | "body"
    | "cookie"
    | "formData"
    | "header"
    | "path"
    | "query"
    | "querystring";
  name: string;
  required?: boolean;
  schema?: {
    [key: string]: unknown;
    properties?: Record<string, unknown>;
    type?: string;
  };
  style?: string;
  type?: "string" | "number" | "integer" | "boolean";
}
