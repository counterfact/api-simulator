import { Readable } from "node:stream";

import createDebug from "debug";
import Koa from "koa";
import bodyParser from "koa-bodyparser";
import { koaSwagger } from "koa2-swagger-ui";

import type { ApiRunner } from "../../api-runner.js";
import type { Config } from "../config.js";
import { adminApiMiddleware } from "./admin-api-middleware.js";
import { routesMiddleware } from "./routes-middleware.js";
import { openapiMiddleware } from "./openapi-middleware.js";

const debug = createDebug("counterfact:server:create-koa-app");

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
}: {
  runners: ApiRunner[];
  config: Config;
}) {
  const app = new Koa();

  for (const runner of runners) {
    app.use(
      openapiMiddleware(`/counterfact/openapi${runner.subdirectory}`, {
        path: runner.openApiPath,
        baseUrl: `//localhost:${config.port}${runner.prefix}`,
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
      app.use(
        adminApiMiddleware(
          `/_counterfact/api${runner.subdirectory}`,
          runner.registry,
          runner.contextRegistry,
          config,
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

  for (const runner of runners) {
    app.use(
      routesMiddleware(runner.prefix, runner.dispatcher, {
        proxyPaths: config.proxyPaths,
        proxyUrl: config.proxyUrl,
      }),
    );
  }

  return app;
}
