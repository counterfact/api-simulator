/**
 * Represents an IANA media type string in the format `type/subtype`
 * (e.g. `"application/json"`, `"text/plain"`, `"image/png"`).
 * Used to identify the content type of an HTTP request or response body.
 */
export type MediaType = `${string}/${string}`;
