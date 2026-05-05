import fs from "node:fs/promises";
/* eslint-disable security/detect-non-literal-fs-filename -- openApiPath comes from startup config and is only used to read the selected OpenAPI document. */

import type { Config } from "./server/config.js";
import { ContextRegistry } from "./server/context-registry.js";
import { Dispatcher, type DispatcherRequest } from "./server/dispatcher.js";
import { loadOpenApiDocument } from "./server/load-openapi-document.js";
import { ModuleLoader } from "./server/module-loader.js";
import { Registry } from "./server/registry.js";
import { pathJoin } from "./util/forward-slash-path.js";

type MswHandlerMap = {
  [key: string]: (request: MockRequest) => Promise<unknown>;
};

const allowedMethods = [
  "all",
  "head",
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "options",
  "query",
] as const;

export type MockRequest = DispatcherRequest & { rawPath: string };

const mswHandlers: MswHandlerMap = {};

/**
 * Dispatches a single MSW (Mock Service Worker) intercepted request to the
 * matching Counterfact route handler registered via {@link createMswHandlers}.
 *
 * @param request - The intercepted request, including the HTTP method, path,
 *   headers, query, body, and a `rawPath` that preserves the original URL
 *   before base-path stripping.
 * @returns The response produced by the matching handler, or a 404 object when
 *   no handler has been registered for the given method and path.
 */
export async function handleMswRequest(request: MockRequest) {
  const { method, rawPath } = request;
  const handler = mswHandlers[`${method}:${rawPath}`];
  if (handler) {
    return handler(request);
  }
  console.warn(`No handler found for ${method} ${rawPath}`);
  return { error: `No handler found for ${method} ${rawPath}`, status: 404 };
}

/**
 * Loads an OpenAPI document, registers all routes from it as MSW handlers, and
 * returns the list of registered routes so callers (e.g. Vitest Browser mode)
 * can mount them on their own request-interception layer.
 *
 * @param config - Counterfact configuration; `openApiPath` and `basePath` are
 *   the most important fields for this function.
 * @param ModuleLoaderClass - Injectable module-loader constructor, primarily
 *   used in tests to substitute a test-friendly implementation.
 * @returns An array of `{ method, path }` objects describing every registered
 *   MSW handler.
 */
export async function createMswHandlers(
  config: Pick<
    Config,
    | "openApiPath"
    | "basePath"
    | "validateRequests"
    | "validateResponses"
    | "alwaysFakeOptionals"
  >,
  ModuleLoaderClass = ModuleLoader,
) {
  // TODO: For some reason the Vitest Custom Commands needed by Vitest Browser mode fail on fs.readFile when they are called from the nested loadOpenApiDocument function.
  // If we "pre-read" the file here it works. This is a workaround to avoid the issue.
  await fs.readFile(config.openApiPath);
  const openApiDocument = await loadOpenApiDocument(config.openApiPath);
  const modulesPath = config.basePath;
  const compiledPathsDirectory = pathJoin(modulesPath, ".cache");

  const registry = new Registry();
  const contextRegistry = new ContextRegistry();
  const dispatcher = new Dispatcher(
    registry,
    contextRegistry,
    openApiDocument,
    config,
  );
  const moduleLoader = new ModuleLoaderClass(
    compiledPathsDirectory,
    registry,
    contextRegistry,
  );
  await moduleLoader.load();
  const routes = registry.routes;
  const handlers = routes.flatMap((route) => {
    const { methods, path } = route;

    return Object.keys(methods)
      .filter((method) =>
        allowedMethods.includes(
          method.toLowerCase() as (typeof allowedMethods)[number],
        ),
      )
      .map((method) => {
        const lowerMethod = method.toLowerCase();
        const apiPath = `${openApiDocument.basePath ?? ""}${path.replaceAll("{", ":").replaceAll("}", "")}`;
        const handler = async (request: MockRequest) => {
          return await dispatcher.request(request);
        };
        mswHandlers[`${method}:${apiPath}`] = handler;
        return { method: lowerMethod, path: apiPath };
      });
  });
  return handlers;
}
