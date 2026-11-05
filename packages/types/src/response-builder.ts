import type { SseEvent } from "./sse-event.js";
import type { CookieOptions } from "./cookie-options.js";
import type { MaybePromise } from "./maybe-promise.js";

/**
 * A loosely-typed, chainable response builder used in non-generated contexts
 * (e.g. middleware or wide/catch-all route handlers) where the exact response
 * shape is not statically known. For generated route handlers, prefer the
 * strongly-typed `GenericResponseBuilder`.
 */
export interface ResponseBuilder {
  /** @deprecated Select a status with response.status(statusCode) instead. */
  [status: number | `${number} ${string}`]: ResponseBuilder;
  binary: (body: Uint8Array | string) => ResponseBuilder;
  content?: { body: unknown; type: string; streamFormat?: "sse" }[];
  cookie: (
    name: string,
    value: string,
    options?: CookieOptions,
  ) => ResponseBuilder;
  empty: () => ResponseBuilder;
  example: (name: string) => ResponseBuilder;
  header: (name: string, value: string) => ResponseBuilder;
  headers: { [name: string]: string | string[] };
  html: (body: unknown) => ResponseBuilder;
  json: (body: unknown) => ResponseBuilder;
  match: (contentType: string, body: unknown) => ResponseBuilder;
  random: () => MaybePromise<ResponseBuilder>;
  randomLegacy: () => MaybePromise<ResponseBuilder>;
  status?: number;
  sse: (events: AsyncIterable<SseEvent>) => ResponseBuilder;
  stream: (iterable: AsyncIterable<unknown>) => ResponseBuilder;
  text: (body: unknown) => ResponseBuilder;
  xml: (body: unknown) => ResponseBuilder;
}
