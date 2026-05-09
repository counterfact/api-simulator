import type { IncomingHttpHeaders } from "node:http";

import createDebug from "debug";
import type Koa from "koa";
import koaProxy from "koa-proxies";

import type { Config } from "../config.js";
import type { Dispatcher } from "../dispatcher.js";
import { isProxyEnabledForPath } from "../is-proxy-enabled-for-path.js";
import type { RequestMethod } from "../registry.js";

declare module "koa" {
  interface Request {
    body?: unknown;
    rawBody?: string;
  }
}

const debug = createDebug("counterfact:server:create-koa-app");

const HTTP_STATUS_CODE_OK = 200;

const HEADERS_TO_DROP = new Set([
  // body may not be gzip anymore
  "content-encoding",
  // length can change when Koa serializes
  "content-length",

  // hop-by-hop
  "transfer-encoding",
  "connection",
  "keep-alive",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "trailers",
]);

function addCors(
  ctx: Koa.ExtendableContext,
  allowedMethods: string,
  headers?: IncomingHttpHeaders,
) {
  // Always append CORS headers, reflecting back the headers requested if any

  ctx.set("Access-Control-Allow-Origin", headers?.origin ?? "*");
  ctx.set("Access-Control-Allow-Methods", allowedMethods);
  ctx.set(
    "Access-Control-Allow-Headers",
    headers?.["access-control-request-headers"] ?? [],
  );
  ctx.set(
    "Access-Control-Expose-Headers",
    headers?.["access-control-request-headers"] ?? [],
  );
  ctx.set("Access-Control-Allow-Credentials", "true");
}

function getAuthObject(
  ctx: Koa.ExtendableContext & { user?: { [key: string]: string } },
):
  | {
      password?: string;
      username?: string;
    }
  | undefined {
  const authHeader = ctx.request.headers.authorization;

  if (authHeader === undefined) {
    return undefined;
  }

  const [, base64Credentials] = authHeader.split(" ");

  if (base64Credentials === undefined) {
    return undefined;
  }

  const user = Buffer.from(base64Credentials, "base64").toString("utf8");
  const [username, password] = user.split(":");

  return { password, username };
}

/**
 * Builds the Koa middleware function that bridges Koa's request context with
 * the Counterfact {@link Dispatcher}.
 *
 * Responsibilities:
 * - Respects `prefix` — requests outside the prefix are passed to `next`.
 * - Adds CORS headers to every response.
 * - Handles `OPTIONS` pre-flight requests (200 with CORS headers, no body).
 * - Proxies the request upstream when proxy is enabled for the path.
 * - Forwards the request to the dispatcher and maps the response back onto
 *   the Koa context.
 *
 * @param prefix - The URL path prefix that this middleware handles, e.g.
 *   `"/api/v1"`. Requests to paths that do not start with this prefix fall
 *   through to the next middleware.
 * @param dispatcher - The {@link Dispatcher} instance that handles requests.
 * @param config - Server configuration (proxy settings, etc.).
 * @param proxy - Proxy factory; injectable for testing.
 * @returns A Koa middleware function.
 */
export function routesMiddleware(
  prefix: string,
  dispatcher: Dispatcher,
  config: Pick<Config, "proxyUrl" | "proxyPaths">,
  proxy = koaProxy,
): Koa.Middleware {
  return async function middleware(ctx, next) {
    const { proxyUrl } = config;

    debug("middleware running for path: %s", ctx.request.path);
    debug("prefix: %s", prefix);

    if (!ctx.request.path.startsWith(prefix)) {
      return await next();
    }

    const auth = getAuthObject(ctx);

    const { body, headers, query, rawBody } = ctx.request;

    const path = ctx.request.path.slice(prefix.length);

    const method = ctx.request.method as RequestMethod;

    if (isProxyEnabledForPath(path, config) && proxyUrl) {
      return proxy("/", { changeOrigin: true, target: proxyUrl })(ctx, next);
    }

    addCors(ctx, dispatcher.registry.allowedMethods(path), headers);

    if (method === "OPTIONS") {
      ctx.status = HTTP_STATUS_CODE_OK;

      return undefined;
    }

    const response = await dispatcher.request({
      auth,

      body: method === "HEAD" || method === "GET" ? undefined : body,

      /* @ts-expect-error the value of a header can be an array and we don't have a solution for that yet */
      headers,
      method,
      path,

      /* @ts-expect-error the value of a querystring item can be an array and we don't have a solution for that yet */
      query,
      rawBody: method === "HEAD" || method === "GET" ? undefined : rawBody,
      req: { path: "", ...ctx.req },
    });

    ctx.body = response.body;

    if (
      response.contentType !== undefined &&
      response.contentType !== "unknown/unknown"
    ) {
      ctx.type = response.contentType;
    }

    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        if (!HEADERS_TO_DROP.has(key.toLowerCase())) {
          if (Array.isArray(value)) {
            ctx.set(key, value);
          } else {
            ctx.set(key, value.toString());
          }
        }
      }
    }

    if (response.appendedHeaders) {
      for (const [key, value] of response.appendedHeaders) {
        ctx.res.appendHeader(key, value);
      }
    }

    ctx.status = response.status ?? HTTP_STATUS_CODE_OK;

    return undefined;
  };
}
