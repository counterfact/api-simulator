import type { CookieOptions } from "./cookie-options.js";
import type { MaybePromise } from "./maybe-promise.js";

/**
 * A loosely-typed response builder used in wide (catch-all) route handlers
 * where the response shape is not known at compile time. Unlike the generated
 * `GenericResponseBuilder`, this interface accepts `unknown` for all body
 * arguments and does not enforce content-type constraints.
 */
export interface WideResponseBuilder {
  binary: (body: Uint8Array | string) => WideResponseBuilder;
  empty: () => WideResponseBuilder;
  example: (name: string) => WideResponseBuilder;
  cookie: (
    name: string,
    value: string,
    options?: CookieOptions,
  ) => WideResponseBuilder;
  header: (body: unknown) => WideResponseBuilder;
  html: (body: unknown) => WideResponseBuilder;
  json: (body: unknown) => WideResponseBuilder;
  match: (contentType: string, body: unknown) => WideResponseBuilder;
  random: () => MaybePromise<WideResponseBuilder>;
  text: (body: unknown) => WideResponseBuilder;
  xml: (body: unknown) => WideResponseBuilder;
  stream: (body: AsyncIterable<unknown>) => WideResponseBuilder;
}
