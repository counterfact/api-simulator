import type { CookieOptions } from "./cookie-options.js";
import type { MaybePromise } from "./maybe-promise.js";

/**
 * A loosely-typed, chainable response builder used in non-generated contexts
 * (e.g. middleware or wide/catch-all route handlers) where the exact response
 * shape is not statically known. For generated route handlers, prefer the
 * strongly-typed `GenericResponseBuilder`.
 */
export interface ResponseBuilder {
  [status: number | `${number} ${string}`]: ResponseBuilder;
  binary: (body: Uint8Array | string) => ResponseBuilder;
  content?: { body: unknown; type: string }[];
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
  stream: (
    iterable: AsyncIterable<unknown>,
    contentType?: string,
  ) => { body: AsyncIterable<unknown>; contentType: string; status?: number };
  text: (body: unknown) => ResponseBuilder;
  xml: (body: unknown) => ResponseBuilder;
}
