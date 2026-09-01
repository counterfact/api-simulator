import { Readable } from "node:stream";

import createDebug from "debug";
import Koa from "koa";
import bodyParser from "koa-bodyparser";
import { koaSwagger } from "koa2-swagger-ui";

import type {
  AdminApiAdapter,
  KoaRuntimeConfig,
  RuntimeEventReporter,
} from "../../runtime-config.js";
import type { ContextRegistry } from "../context-registry.js";
import type { Dispatcher } from "../dispatcher.js";
import type { Registry } from "../registry.js";
import { adminApiMiddleware } from "./admin-api-middleware.js";
import {
  routesMiddleware,
  routesMiddlewareForRunners,
} from "./routes-middleware.js";
import { openapiMiddleware } from "./openapi-middleware.js";

const debug = createDebug("counterfact:server:create-koa-app");

/** Runtime-owned view of a facade runner used by the Koa layer. */
export interface RuntimeRunner {
  contextRegistry: ContextRegistry;
  dispatcher: Dispatcher;
  openApiPath: string;
  overlays: readonly string[];
  prefix: string;
  registry: Registry;
  subdirectory: string;
}

/**
 * Builds and configures the Koa application with all built-in middleware.
 *
 * The middleware stack (in order) is:
 * 1. Per runner: OpenAPI document serving at `/counterfact/openapi${runner.subdirectory}`
 * 2. Per runner: Swagger UI at `/counterfact/swagger${runner.subdirectory}`
 * 3. Per runner: Admin API (when `config.startAdminApi` is `true`) at `/_counterfact/api${runner.subdirectory}`
 * 4. Redirect `/counterfact` → `/counterfact/swagger`
 * 5. Body parser
 * 6. JSON serialisation of object bodies
 * 7. Per runner: Route-dispatching middleware at `runner.prefix`
 *
 * @param runners - The ApiRunner instances, one per API spec.
 * @param config - Server configuration.
 * @returns A configured Koa application (not yet listening).
 */
export function createKoaApp({
  runners,
  config,
  adminApi,
  reportEvent = () => {},
}: {
  runners: RuntimeRunner[];
  config: KoaRuntimeConfig;
  adminApi?: AdminApiAdapter;
  reportEvent?: RuntimeEventReporter;
}) {
  const app = new Koa();
  let firstApiRequestReported = false;
  const reportFirstApiRequest: RuntimeEventReporter = (event, properties) => {
    if (event === "first_api_request_served" && firstApiRequestReported) {
      return;
    }

    if (event === "first_api_request_served") {
      firstApiRequestReported = true;
    }
    reportEvent(event, properties);
  };

  for (const runner of runners) {
    app.use(
      openapiMiddleware(`/counterfact/openapi${runner.subdirectory}`, {
        path: runner.openApiPath,
        baseUrl: `//localhost:${config.port}${runner.prefix}`,
        overlays: runner.overlays,
      }),
    );

    app.use(
      koaSwagger({
        routePrefix: `/counterfact/swagger${runner.subdirectory}`,

        swaggerOptions: {
          url: `/counterfact/openapi${runner.subdirectory}`,
        },
      }),
    );

    if (config.startAdminApi) {
      if (adminApi === undefined) {
        throw new Error(
          "An adminApi adapter is required when startAdminApi is enabled",
        );
      }
      app.use(
        adminApiMiddleware(
          `/_counterfact/api${runner.subdirectory}`,
          runner.registry,
          runner.contextRegistry,
          adminApi,
        ),
      );
    }
  }

  debug("basePath: %s", config.basePath);

  app.use(async (ctx, next) => {
    if (ctx.URL.pathname === "/counterfact") {
      ctx.redirect("/counterfact/swagger");

      return;
    }

    await next();
  });

  app.use(bodyParser());

  app.use(async (ctx, next) => {
    await next();

    if (
      ctx.body !== null &&
      ctx.body !== undefined &&
      typeof ctx.body === "object" &&
      !Buffer.isBuffer(ctx.body) &&
      !(ctx.body instanceof Readable)
    ) {
      ctx.body = JSON.stringify(ctx.body, null, 2);
      ctx.type = "application/json";
    }
  });

  const [onlyRunner] = runners;
  if (runners.length === 1 && onlyRunner !== undefined) {
    app.use(
      routesMiddleware(
        onlyRunner.prefix,
        onlyRunner.dispatcher,
        {
          proxyPaths: config.proxyPaths,
          proxyUrl: config.proxyUrl,
        },
        undefined,
        undefined,
        reportFirstApiRequest,
      ),
    );
  } else {
    app.use(
      routesMiddlewareForRunners(
        runners,
        {
          proxyPaths: config.proxyPaths,
          proxyUrl: config.proxyUrl,
        },
        undefined,
        reportFirstApiRequest,
      ),
    );
  }

  return app;
}
