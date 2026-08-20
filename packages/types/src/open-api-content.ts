/**
 * Represents a single content entry in an OpenAPI response object.
 * The `schema` property holds the JSON Schema definition for the body of
 * a response with this media type.
 */
export interface OpenApiContent {
  schema: unknown;
}
