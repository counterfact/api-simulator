import { mediaTypes } from "@hapi/accept";
import createDebugger from "debug";

import fetch, { Headers } from "node-fetch";

import type { ContextRegistry } from "./context-registry.js";
import type {
  HttpMethods,
  CounterfactResponseObject,
  Registry,
} from "./registry.js";
import { createResponseBuilder } from "./response-builder.js";
import {
  isExplodedObjectQueryParam,
  validateRequest,
} from "./request-validator.js";
import { validateResponse } from "./response-validator.js";
import { Tools } from "./tools.js";
import type {
  OpenApiOperation,
  OpenApiParameters,
} from "../counterfact-types/index.js";
import type { Config } from "./config.js";

const debug = createDebugger("counterfact:server:dispatcher");

/**
 * Merges path-item-level and operation-level parameter arrays.
 *
 * Operation-level parameters take precedence when both arrays define a
 * parameter with the same `name` and `in` location, per the OpenAPI
 * specification.
 */
function mergeParameters(
  pathItemParams: OpenApiParameters[],
  operationParams: OpenApiParameters[],
): OpenApiParameters[] {
  const map = new Map<string, OpenApiParameters>();

  for (const p of pathItemParams) {
    map.set(`${p.in}:${p.name}`, p);
  }

  for (const p of operationParams) {
    map.set(`${p.in}:${p.name}`, p);
  }

  return [...map.values()];
}

export interface OpenApiDocument {
  basePath?: string;
  paths: {
    [key: string]: {
      [key in Lowercase<HttpMethods>]?: OpenApiOperation;
    } & { parameters?: OpenApiParameters[] };
  };
  produces?: string[];
}

/**
 * Parses the `Cookie` request header into a key/value map.
 *
 * Duplicate keys are silently dropped (first occurrence wins) and values are
 * percent-decoded where possible.
 *
 * @param cookieHeader - The raw `Cookie` header string.
 * @returns A record mapping cookie name to decoded value.
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  for (const part of cookieHeader.split(";")) {
    const eqIndex = part.indexOf("=");

    if (eqIndex === -1) {
      continue;
    }

    const key = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim();

    if (key && !(key in cookies)) {
      try {
        cookies[key] = decodeURIComponent(value);
      } catch (error) {
        debug("could not decode cookie value for key %s: %o", key, error);
        cookies[key] = value;
      }
    }
  }

  return cookies;
}

interface ParameterTypes {
  body: Map<string, string>;
  cookie: Map<string, string>;
  formData: Map<string, string>;
  header: Map<string, string>;
  path: Map<string, string>;
  query: Map<string, string>;
}

export type DispatcherRequest = {
  auth?: {
    password?: string;
    username?: string;
  };
  body: unknown;
  headers: {
    [key: string]: string;
  };
  method: HttpMethods;
  path: string;
  query: {
    [key: string]: string | string[];
  };
  rawBody?: string;
  req: {
    path?: string;
  };
};

/**
 * Gathers exploded object query parameters back into a nested object under the
 * parameter's own name.
 *
 * Per OpenAPI 3.x, a query parameter of type `object` with `style: form` and
 * `explode: true` (both defaults for query params) is serialised as individual
 * query parameters — one per object property.  This function reconstructs the
 * object so that the route handler can access `$.query.<paramName>` rather than
 * only the individual flat parameters.
 *
 * Properties that are "claimed" by an object parameter are removed from the
 * top-level map and placed under the parameter name. Unclaimed keys remain at
 * the top level.
 *
 * @param query - The raw parsed query-string map from the HTTP request.
 * @param parameters - The OpenAPI parameter definitions for the current operation.
 * @returns A new map with exploded object parameters reconstructed as nested objects.
 */
export function collectExplodedObjectParams(
  query: Record<string, string | string[] | unknown>,
  parameters: OpenApiParameters[],
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...query };

  for (const parameter of parameters) {
    if (!isExplodedObjectQueryParam(parameter)) continue;

    const properties = parameter.schema?.properties;
    if (!properties) continue;

    const obj: Record<string, unknown> = {};

    for (const key of Object.keys(properties)) {
      if (key in result) {
        obj[key] = result[key];
        delete result[key];
      }
    }

    if (Object.keys(obj).length > 0) {
      result[parameter.name] = obj;
    }
  }

  return result;
}

/**
 * Core HTTP request dispatcher.
 *
 * Receives incoming requests from the Koa middleware layer, matches them
 * against the {@link Registry}, optionally validates the request and response
 * against the OpenAPI spec, and invokes the matching route-handler function.
 *
 * Content-negotiation (Accept header handling) is performed before returning
 * the response so the caller always receives the most appropriate content type.
 */
export class Dispatcher {
  public registry: Registry;

  public contextRegistry: ContextRegistry;

  public openApiDocument: OpenApiDocument | undefined;

  public fetch: typeof fetch;

  public config?: Pick<
    Config,
    "validateRequests" | "validateResponses" | "alwaysFakeOptionals"
  >; // Add config property

  /**
   * The version label for this dispatcher's spec (e.g. `"v1"`, `"v2"`).
   * Empty string when running without a version.
   */
  public readonly version: string;

  /**
   * Ordered list of all version labels for the API group this dispatcher
   * belongs to. The first entry is the oldest version. Used by
   * `$.minVersion()` at runtime to determine if the current version is
   * greater than or equal to a given minimum version.
   */
  public readonly versions: readonly string[];

  public constructor(
    registry: Registry,
    contextRegistry: ContextRegistry,
    openApiDocument?: OpenApiDocument,
    config?: Pick<
      Config,
      "validateRequests" | "validateResponses" | "alwaysFakeOptionals"
    >,
    version = "",
    versions: readonly string[] = [],
  ) {
    this.registry = registry;
    this.contextRegistry = contextRegistry;
    this.openApiDocument = openApiDocument;
    this.fetch = fetch;
    this.config = config;
    this.version = version;
    this.versions = versions;
  }

  private parameterTypes(
    parameters: OpenApiParameters[] | undefined,
  ): ParameterTypes {
    const types: ParameterTypes = {
      body: new Map(),
      cookie: new Map(),
      formData: new Map(),
      header: new Map(),
      path: new Map(),
      query: new Map(),
    };

    if (!parameters) {
      return types;
    }

    for (const parameter of parameters) {
      // querystring parameters represent the entire query string as a single
      // typed object; they are not individually coerced by name.
      if (parameter.in === "querystring") {
        continue;
      }

      const type = parameter?.type ?? parameter?.schema?.type;

      if (type !== undefined) {
        types[parameter.in].set(
          parameter.name,
          type === "integer" ? "number" : type,
        );
      }
    }

    return types;
  }

  private findPathItem(path: string):
    | ({
        [key in Lowercase<HttpMethods>]?: OpenApiOperation;
      } & { parameters?: OpenApiParameters[] })
    | undefined {
    if (!this.openApiDocument) {
      return undefined;
    }

    for (const key in this.openApiDocument.paths) {
      if (key.toLowerCase() === path.toLowerCase()) {
        return this.openApiDocument.paths[key];
      }
    }

    return undefined;
  }

  /**
   * Resolves the OpenAPI operation for `path` and `method`, merging any
   * top-level `produces` array from the document root and any path-item-level
   * `parameters` into the operation.
   *
   * Per the OpenAPI specification, parameters defined at the path item level
   * are shared across all operations on that path. Operation-level parameters
   * take precedence when both define a parameter with the same `name` and `in`.
   *
   * @param path - The matched route path (e.g. `"/pets/{petId}"`).
   * @param method - The HTTP method.
   * @returns The {@link OpenApiOperation} if found, or `undefined`.
   */
  public operationForPathAndMethod(
    path: string,
    method: HttpMethods,
  ): OpenApiOperation | undefined {
    const pathItem = this.findPathItem(path);

    if (pathItem === undefined) {
      return undefined;
    }

    const operation = pathItem[method.toLowerCase() as Lowercase<HttpMethods>];

    if (operation === undefined) {
      return undefined;
    }

    // Merge path-item-level parameters with operation-level parameters.
    // Operation-level parameters take precedence on same name+in collision.
    const pathItemParams = pathItem.parameters ?? [];
    const operationParams = operation.parameters ?? [];
    const mergedParameters =
      pathItemParams.length > 0
        ? mergeParameters(pathItemParams, operationParams)
        : operationParams.length > 0
          ? operationParams
          : undefined;

    const mergedOperation =
      mergedParameters !== undefined
        ? { ...operation, parameters: mergedParameters }
        : operation;

    if (this.openApiDocument?.produces) {
      return {
        produces: this.openApiDocument.produces,
        ...mergedOperation,
      };
    }

    return mergedOperation;
  }

  private normalizeResponse(
    response: CounterfactResponseObject,
    acceptHeader: string,
  ): CounterfactResponseObject {
    if (response.content !== undefined) {
      const content = this.selectContent(acceptHeader, response.content);

      if (content === undefined) {
        return {
          body: `Not Acceptable: could not produce a response matching any of the following content types: ${acceptHeader}`,
          contentType: "text/plain",
          status: 406,
        };
      }

      const normalizedResponse = {
        ...response,

        body: content.body as Uint8Array | string | undefined,
        contentType: content.type,
      };

      delete normalizedResponse.content;

      return normalizedResponse;
    }

    return {
      ...response,

      contentType:
        response.headers?.["content-type"]?.toString() ??
        response.contentType ??
        "unknown/unknown",
    };
  }

  /**
   * Picks the best matching content entry from a multi-type response using the
   * request's `Accept` header preferences.
   *
   * @param acceptHeader - The value of the `Accept` request header.
   * @param content - Array of `{ type, body }` objects representing all
   *   available content-type variants.
   * @returns The first entry whose MIME type satisfies the accept preferences,
   *   or `undefined` when none match.
   */
  public selectContent(
    acceptHeader: string,
    content: { body: unknown; type: string }[],
  ) {
    const preferredMediaTypes = mediaTypes(acceptHeader);

    for (const mediaType of preferredMediaTypes) {
      const contentItem = content.find((item) =>
        this.isMediaType(item.type, mediaType),
      );

      if (contentItem) {
        return contentItem;
      }
    }

    return undefined;
  }

  private isMediaType(type: string, pattern: string) {
    if (pattern === "*/*") {
      return true;
    }

    const [baseType, subType] = type.split("/");

    const [patternType, patternSubType] = pattern.split("/");

    if (baseType === patternType) {
      return subType === patternSubType || patternSubType === "*";
    }

    if (subType === patternSubType) {
      return baseType === patternType || patternType === "*";
    }

    return false;
  }

  /**
   * Main request handler.
   *
   * Orchestrates base-path stripping, route matching, request validation,
   * handler invocation, content negotiation, and response validation.
   *
   * @param request - The incoming request descriptor.
   * @returns A promise that resolves to a {@link CounterfactResponseObject}.
   */
  public async request({
    auth,
    body,
    headers = {},
    method,
    path,
    query,
    rawBody,
    req,
  }: DispatcherRequest): Promise<CounterfactResponseObject> {
    debug(`request: ${method} ${path}`);
    debug(`headers: ${JSON.stringify(headers)}`);
    debug(`body: ${JSON.stringify(body)}`);

    // If the incoming path includes the base path, remove it
    if (
      this.openApiDocument?.basePath !== undefined &&
      path.toLowerCase().startsWith(this.openApiDocument.basePath.toLowerCase())
    ) {
      path = path.slice(this.openApiDocument.basePath.length);
    }

    const { matchedPath } = this.registry.handler(path, method);

    if (
      !this.registry.exists(method, path) &&
      this.registry.pathExistsWithAnyMethod(path, method)
    ) {
      return {
        body: `The ${method} method is not allowed for ${path}\n`,
        contentType: "text/plain",
        headers: { allow: this.registry.allowedMethods(path) },
        status: 405,
      };
    }

    const operation = this.operationForPathAndMethod(matchedPath, method);

    if (this.config?.validateRequests !== false) {
      const validation = validateRequest(operation, { body, headers, query });

      if (!validation.valid) {
        return {
          body: `Request validation failed:\n${validation.errors.join("\n")}`,
          contentType: "text/plain",
          status: 400,
        };
      }
    }

    // Reconstruct exploded object query parameters so that `$.query.<name>`
    // contains the assembled object instead of only the individual flat keys.
    const processedQuery = collectExplodedObjectParams(
      query,
      operation?.parameters ?? [],
    );

    const continuousDistribution = (min: number, max: number) => {
      return min + Math.random() * (max - min);
    };

    const response = await this.registry.endpoint(
      method,
      path,
      this.parameterTypes(operation?.parameters),
    )({
      auth,
      body,
      context: this.contextRegistry.find(matchedPath),

      async delay(milliseconds = 0, maxMilliseconds = 0) {
        const delayInMs =
          maxMilliseconds - milliseconds <= 0
            ? milliseconds
            : continuousDistribution(milliseconds, maxMilliseconds);

        return new Promise((resolve) => setTimeout(resolve, delayInMs));
      },

      cookie: parseCookies(headers.cookie ?? headers.Cookie ?? ""),

      headers,

      proxy: async (url: string) => {
        delete headers.host;

        const fetchResponse = await this.fetch(`${url}${req.path ?? ""}`, {
          body: body === undefined ? undefined : rawBody,
          headers: new Headers(headers),
          method,
        });

        const responseHeaders = Object.fromEntries(
          fetchResponse.headers.entries(),
        );

        return {
          body: await fetchResponse.text(),
          contentType: responseHeaders["content-type"] ?? "unknown/unknown",
          headers: responseHeaders,
          status: fetchResponse.status,
        };
      },

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- object params are reconstructed and typed by generated route types
      query: processedQuery as any,

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed by generated route types; entire query string as a single object
      querystring: processedQuery as any,

      // @ts-expect-error - Might be pushing the limits of what TypeScript can do here
      response: createResponseBuilder(
        operation ?? { responses: {} },
        this.config,
      ), // Pass config

      tools: new Tools({ headers }),

      ...(this.version !== "" && {
        version: this.version,
        minVersion: (min: string): boolean => {
          const currentIdx = this.versions.indexOf(this.version);
          const minIdx = this.versions.indexOf(min);

          if (currentIdx === -1 || minIdx === -1) {
            return false;
          }

          return currentIdx >= minIdx;
        },
      }),
    });

    if (response === undefined) {
      return {
        body: `The ${method} function did not return anything. Did you forget a return statement?`,
        status: 500,
      };
    }

    const normalizedResponse = this.normalizeResponse(
      response,
      headers.accept ?? "*/*",
    );

    if (
      normalizedResponse.body !== undefined &&
      !mediaTypes(headers.accept ?? "*/*").some((type) =>
        this.isMediaType(normalizedResponse.contentType ?? "", type),
      )
    ) {
      return {
        body: JSON.stringify(mediaTypes(headers.accept ?? "*/*")),
        status: 406,
      };
    }

    if (this.config?.validateResponses !== false) {
      const validation = validateResponse(operation, normalizedResponse);

      if (!validation.valid) {
        return {
          ...normalizedResponse,
          appendedHeaders: [
            ...(normalizedResponse.appendedHeaders ?? []),
            ...validation.errors.map((error): [string, string] => [
              "response-type-error",
              error,
            ]),
          ],
        };
      }
    }

    return normalizedResponse;
  }
}
