import createDebugger from "debug";

import { ModuleTree } from "./module-tree.js";
import type { Tools } from "./tools.js";
import type {
  MediaType,
  ResponseBuilderFactory,
} from "../counterfact-types/index.js";

const debug = createDebugger("counterfact:server:registry");

type HttpMethods =
  | "DELETE"
  | "GET"
  | "HEAD"
  | "OPTIONS"
  | "PATCH"
  | "POST"
  | "PUT"
  | "QUERY"
  | "TRACE";

const ALL_HTTP_METHODS: HttpMethods[] = [
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
  "QUERY",
  "TRACE",
];

interface RequestData {
  auth?: {
    password?: string;
    username?: string;
  };
  context: unknown;
  cookie: { [name: string]: string | undefined };
  headers: { [key: string]: number | string | boolean };
  matchedPath?: string;
  path?: { [key: string]: number | string | boolean };
  proxy: (url: string) => Promise<{
    body: string;
    contentType: string;
    headers: { [key: string]: string };
    status: number;
  }>;
  query: { [key: string]: number | string | boolean };
  response: ResponseBuilderFactory;
  tools: Tools;
  body?: unknown;
  delay: (milliseconds: number, maxMilliseconds: number) => Promise<void>;
}

interface RequestDataWithBody extends RequestData {
  body?: unknown;
}

type UserDefinedResponse =
  | Promise<CounterfactResponseObject | undefined | string>
  | CounterfactResponseObject
  | undefined
  | string;

interface Module {
  DELETE?: (requestData: RequestData) => UserDefinedResponse;
  GET?: (requestData: RequestData) => UserDefinedResponse;
  HEAD?: (requestData: RequestData) => UserDefinedResponse;
  OPTIONS?: (requestData: RequestData) => UserDefinedResponse;
  PATCH?: (requestData: RequestDataWithBody) => UserDefinedResponse;
  POST?: (requestData: RequestDataWithBody) => UserDefinedResponse;
  PUT?: (requestData: RequestDataWithBody) => UserDefinedResponse;
  QUERY?: (requestData: RequestDataWithBody) => UserDefinedResponse;
  TRACE?: (requestData: RequestData) => UserDefinedResponse;
}

type CounterfactResponseObject = {
  appendedHeaders?: [string, string][];
  body?: Uint8Array | string;
  content?: {
    body: unknown;
    type: MediaType;
  }[];
  contentType?: string;
  headers?: { [key: string]: number | string | string[] };
  status?: number;
};

type RespondTo = ($: RequestData) => Promise<CounterfactResponseObject>;

type MiddlewareFunction = (
  $: RequestData,
  respondTo: RespondTo,
) => Promise<CounterfactResponseObject>;

/**
 * Casts a string URL/header/query parameter value to the type declared in the
 * OpenAPI spec.
 *
 * @param value - The raw parameter value (may already be the correct type when
 *   the HTTP framework has pre-parsed it).
 * @param type - The OpenAPI primitive type string (`"integer"`, `"number"`,
 *   `"boolean"`, or anything else to leave as a string).
 * @returns The value coerced to the appropriate JavaScript type.
 */
function castParameter(value: string | number | boolean, type: string) {
  if (typeof value !== "string") {
    return value;
  }

  if (type === "integer") {
    return Number.parseInt(value);
  }

  if (type === "number") {
    return Number.parseFloat(value);
  }

  if (type === "boolean") {
    return value === "true";
  }

  return value;
}

/**
 * Applies {@link castParameter} to every value in a parameters map.
 *
 * @param parameters - Key/value map of raw parameter values.
 * @param parameterTypes - Map from parameter name to its OpenAPI type string.
 * @returns A new object with the same keys and cast values.
 */
function castParameters(
  parameters: { [key: string]: string | number | boolean } = {},
  parameterTypes: Map<string, string> = new Map(),
) {
  const copy: { [key: string]: boolean | number | string } = {};

  Object.entries(parameters).forEach(([key, value]) => {
    copy[key] = castParameter(value, parameterTypes.get(key) ?? "string");
  });

  return copy;
}

/**
 * Central route registry that maps URL patterns to route-handler modules.
 *
 * Routes are stored in a {@link ModuleTree} that supports wildcard path
 * segments (e.g. `{petId}`). The registry also maintains an ordered chain of
 * middleware functions that wrap every route handler execution.
 */
export class Registry {
  private readonly moduleTree = new ModuleTree();

  private middlewares: Map<string, MiddlewareFunction> = new Map();

  public constructor() {
    this.middlewares.set("", ($, respondTo) => respondTo($));
  }

  /** Returns all registered routes as a flat array of `{ path, methods }` objects. */
  public get routes() {
    return this.moduleTree.routes;
  }

  /**
   * Registers (or replaces) the module for a URL pattern.
   *
   * @param url - The URL pattern (e.g. `/pets/{petId}`).
   * @param module - The route-handler module exposing HTTP-method functions.
   */
  public add(url: string, module: Module) {
    this.moduleTree.add(url, module);
  }

  /**
   * Registers a middleware function that wraps every handler under `url`.
   *
   * Middleware receives `($, respondTo)` where `respondTo` is the next handler
   * in the chain. Setting `url` to `"/"` makes the middleware global.
   *
   * @param url - The path prefix at which this middleware applies.
   * @param callback - The middleware function.
   */
  public addMiddleware(url: string, callback: MiddlewareFunction): void {
    this.middlewares.set(url === "/" ? "" : url, callback);
  }

  /**
   * Removes the module registered at `url`.
   *
   * @param url - The URL pattern to deregister.
   */
  public remove(url: string) {
    this.moduleTree.remove(url);
  }

  /**
   * Returns `true` when a handler for `method` is registered at `url`.
   *
   * @param method - HTTP method (e.g. `"GET"`).
   * @param url - The request URL.
   */
  public exists(method: HttpMethods, url: string) {
    return Boolean(this.handler(url, method).module?.[method]);
  }

  /**
   * Finds the best-matching module and extracts path-variable bindings for a
   * given URL and HTTP method.
   *
   * @param url - The incoming request URL.
   * @param method - The HTTP method.
   * @returns An object with `module`, `path` (variable bindings),
   *   `matchedPath`, and `ambiguous` flag.
   */
  public handler(url: string, method: string) {
    const match = this.moduleTree.match(url, method);

    return {
      ambiguous: match?.ambiguous ?? false,
      matchedPath: match?.matchedPath ?? "",
      module: match?.module,
      path: match?.pathVariables ?? {},
    };
  }

  /**
   * Returns `true` when the URL matches a registered module for at least one
   * HTTP method other than `excludeMethod`.
   *
   * Used to decide whether to respond with 405 Method Not Allowed.
   *
   * @param url - The request URL.
   * @param excludeMethod - The method to exclude from the check.
   */
  public pathExistsWithAnyMethod(
    url: string,
    excludeMethod: HttpMethods,
  ): boolean {
    return ALL_HTTP_METHODS.filter((method) => method !== excludeMethod).some(
      (method) => this.moduleTree.match(url, method) !== undefined,
    );
  }

  /**
   * Returns a comma-separated list of HTTP methods that have a registered
   * handler at `url`.  Used to populate the `Allow` response header for 405
   * responses.
   *
   * @param url - The request URL.
   */
  public allowedMethods(url: string): string {
    return ALL_HTTP_METHODS.filter((method) =>
      Boolean(this.moduleTree.match(url, method)?.module?.[method]),
    ).join(", ");
  }

  /**
   * Returns an async function that executes the registered handler for
   * `httpRequestMethod` at `url`, wrapped by all applicable middleware.
   *
   * Path, query, and header parameter values are cast to their declared types
   * before being forwarded to the handler.  The returned function always
   * resolves to a {@link CounterfactResponseObject}.
   *
   * @param httpRequestMethod - The HTTP method to look up.
   * @param url - The incoming request URL (before path-variable substitution).
   * @param parameterTypes - Optional maps from parameter name to OpenAPI type
   *   for each of `header`, `path`, and `query`.
   */
  public endpoint(
    httpRequestMethod: HttpMethods,
    url: string,
    parameterTypes: {
      header?: Map<string, string>;
      path?: Map<string, string>;
      query?: Map<string, string>;
    } = {},
  ) {
    const handler = this.handler(url, httpRequestMethod);

    debug("handler for %s: %o", url, handler);

    if (handler.ambiguous) {
      return () => ({
        body: `Ambiguous wildcard paths: the request to ${url} matches multiple routes. Please resolve the ambiguity in your API spec or route handlers.`,
        contentType: "text/plain",
        headers: {},
        status: 500,
      });
    }

    const execute = handler.module?.[httpRequestMethod];

    if (!execute) {
      debug(`Could not find a ${httpRequestMethod} method matching ${url}\n`);
      return () => ({
        body: `Could not find a ${httpRequestMethod} method matching ${url}\n`,
        contentType: "text/plain",
        headers: {},
        status: 404,
      });
    }

    return async ({ ...requestData }: RequestDataWithBody) => {
      const operationArgument: RequestDataWithBody & {
        x?: RequestDataWithBody;
      } = {
        ...requestData,
        headers: castParameters(requestData.headers, parameterTypes.header),
        matchedPath: handler.matchedPath,
        path: castParameters(handler.path, parameterTypes.path),
        query: castParameters(requestData.query, parameterTypes.query),
      };

      operationArgument.x = operationArgument;

      const executeAndNormalizeResponse = async (
        requestData: RequestDataWithBody,
      ) => {
        const result = await execute(requestData);
        if (typeof result === "string") {
          return {
            headers: {},
            status: 200,
            body: result,
            contentType: "text/plain",
          };
        }

        if (typeof result === "undefined") {
          return {
            headers: {},
            body: `The ${httpRequestMethod} function did not return anything. Did you forget a return statement?`,
            status: 500,
          };
        }
        return result;
      };

      const middlewares = this.middlewares;

      function recurse(path: string | null, respondTo: RespondTo) {
        debug("recursing path", path);

        if (path === null) return respondTo;

        const nextPath =
          path === "" ? null : path.slice(0, path.lastIndexOf("/"));

        const middleware = middlewares.get(path);
        if (middleware !== undefined) {
          return recurse(nextPath, ($) => middleware($, respondTo));
        }

        return recurse(nextPath, respondTo);
      }

      return recurse(
        operationArgument.matchedPath ?? "/",
        executeAndNormalizeResponse,
      )(operationArgument);
    };
  }
}

export type {
  CounterfactResponseObject,
  HttpMethods,
  Module,
  RequestDataWithBody,
  MiddlewareFunction,
};
