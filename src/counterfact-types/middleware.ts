import type { COUNTERFACT_RESPONSE } from "./counterfact-response.js";
import type { HttpStatusCode } from "./http-status-code.js";
import type { MaybePromise } from "./maybe-promise.js";
import type { MediaType } from "./media-type.js";
import type { ResponseBuilder } from "./response-builder.js";

/**
 * The untyped response object that Counterfact passes between middleware and
 * route handlers.
 */
export interface MiddlewareResponseObject {
  appendedHeaders?: [string, string][];
  body?: AsyncIterable<unknown> | Uint8Array | string;
  content?: { body: unknown; type: MediaType }[];
  contentType?: string;
  headers?: { [key: string]: number | string | string[] };
  status?: number;
}

/** Utilities available to middleware through `$.tools`. */
export interface MiddlewareTools {
  accepts: (contentType: string) => boolean;
  oneOf: <Item>(array: Item[]) => Item;
  randomFromSchema: (schema: object) => Promise<unknown>;
}

/** A response-builder factory with every standard status code available. */
export type MiddlewareResponseBuilderFactory = {
  [StatusCode in HttpStatusCode]: ResponseBuilder;
} & { [key: number]: ResponseBuilder };

/**
 * The request argument passed to a custom middleware function.
 *
 * Supply the context type from the nearest `_.context.ts` file to retain
 * autocomplete and checking for `$.context`.
 */
export interface MiddlewareRequest<Context = unknown> {
  auth?: { apiKey?: string; password?: string; username?: string };
  body?: unknown;
  context: Context;
  cookie: { [name: string]: string | undefined };
  delay: (milliseconds: number, maxMilliseconds: number) => Promise<void>;
  headers: { [key: string]: boolean | number | string };
  matchedPath?: string;
  path?: { [key: string]: boolean | number | string };
  proxy: (url: string) => Promise<{
    body: string;
    contentType: string;
    headers: { [key: string]: string };
    status: number;
  }>;
  query: { [key: string]: boolean | number | string };
  response: MiddlewareResponseBuilderFactory;
  tools: MiddlewareTools;
}

/** A response value that middleware may return or receive from `respondTo`. */
export type MiddlewareResponse =
  | COUNTERFACT_RESPONSE
  | MiddlewareResponseObject
  | ResponseBuilder
  | string;

/** Passes a request to the next matching middleware or route handler. */
export type RespondTo<Context = unknown> = (
  request: MiddlewareRequest<Context>,
) => Promise<MiddlewareResponse>;

/**
 * A custom Counterfact middleware function.
 *
 * @example
 * ```ts
 * import type { Middleware } from "../counterfact-types/index.js";
 * import type { Context } from "./_.context.js";
 *
 * export const middleware: Middleware<Context> = async ($, respondTo) => {
 *   if (!$.context.isAuthorized($.auth?.apiKey)) {
 *     return $.response[401].json({ error: "Unauthorized" });
 *   }
 *
 *   return respondTo($);
 * };
 * ```
 */
export type Middleware<Context = unknown> = (
  request: MiddlewareRequest<Context>,
  respondTo: RespondTo<Context>,
) => MaybePromise<MiddlewareResponse>;
