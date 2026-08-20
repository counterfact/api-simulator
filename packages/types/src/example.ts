/**
 * Represents a named example defined in an OpenAPI document.
 * Examples can be referenced by route handlers via the `.example(name)` method
 * on the response builder.
 *
 * OpenAPI 3.2 adds `dataValue` as a structured alternative to `value`.
 * When present, `dataValue` is preferred over `value`.
 */
export interface Example {
  dataValue?: unknown;
  description: string;
  summary: string;
  value?: unknown;
}
