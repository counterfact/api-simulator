import type { CookieOptions } from "./cookie-options.js";
import type { HttpStatusCode } from "./http-status-code.js";
import type { WideResponseBuilder } from "./wide-response-builder.js";

/**
 * The loosely-typed argument object passed to wide (catch-all) route handlers.
 * Unlike the generated operation argument types, all fields are typed as
 * `unknown` or broad index signatures. Use this when writing handlers that
 * should accept any request without compile-time schema enforcement.
 */
export interface WideOperationArgument {
  body: unknown;
  context: unknown;
  headers: { [key: string]: string };
  path: { [key: string]: string };
  proxy: (url: string) => { proxyUrl: string };
  query: { [key: string]: string };
  response: {
    /** @deprecated Use response.status(statusCode) instead. */
    [StatusCode in HttpStatusCode]: WideResponseBuilder;
  } & {
    /** @deprecated Use response.status(statusCode) instead. */
    [key: number]: WideResponseBuilder;
    status: (statusCode: number | `${number} ${string}`) => WideResponseBuilder;
    header: (name: string, value: string) => WideOperationArgument["response"];
    cookie: (
      name: string,
      value: string,
      options?: CookieOptions,
    ) => WideOperationArgument["response"];
  };
}
