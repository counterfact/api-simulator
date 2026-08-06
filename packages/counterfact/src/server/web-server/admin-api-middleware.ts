import type Koa from "koa";
import createDebug from "debug";

import type { Config } from "../config.js";
import type { Context, ContextRegistry } from "../context-registry.js";
import type { Registry } from "../registry.js";

const debug = createDebug("counterfact:server:admin-api-middleware");

interface AdminApiResponse {
  success?: boolean;
  data?: unknown;
  error?: string;
  message?: string;
}

function extractBearerToken(authorization?: string): string | undefined {
  if (!authorization) return undefined;
  const [scheme, token] = authorization.trim().split(/\s+/, 2);
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return undefined;
  return token;
}

function normalizeIp(ip?: string): string {
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) return ip.slice("::ffff:".length);
  return ip;
}

function isLoopbackIp(ip?: string): boolean {
  const normalized = normalizeIp(ip);
  return (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1"
  );
}

/**
 * Admin API middleware for programmatic access to Counterfact internals.
 * Exposes context management, proxy configuration, and route discovery
 * through HTTP endpoints at the given path prefix.
 *
 * This enables AI agents and external tools to interact with the mock server
 * in the same way the REPL does, but via HTTP requests.
 *
 * @param pathPrefix - The URL path prefix at which the admin API is mounted,
 *   e.g. `"/_counterfact/api"`. Requests to paths that do not start with this
 *   prefix fall through to the next middleware.
 * @param registry - The route registry used to list available routes.
 * @param contextRegistry - The context registry used to read and update
 *   per-path context objects.
 * @param config - Server configuration (proxy settings, port, etc.).
 * @returns A Koa middleware function.
 */
export function adminApiMiddleware(
  pathPrefix: string,
  registry: Registry,
  contextRegistry: ContextRegistry,
  config: Config,
): Koa.Middleware {
  return async (ctx: Koa.ExtendableContext, next: Koa.Next) => {
    const { pathname } = ctx.URL;

    // Only handle admin API routes (exact prefix or paths beneath it)
    if (pathname !== pathPrefix && !pathname.startsWith(`${pathPrefix}/`)) {
      return await next();
    }

    // ===== Admin API Access Guard =====
    // If an admin API token is configured, require Authorization: Bearer <token>.
    // If not set, only allow loopback access.
    const configuredToken = (
      config.adminApiToken ??
      process.env.COUNTERFACT_ADMIN_API_TOKEN ??
      ""
    ).trim();
    const authHeader =
      typeof ctx.get === "function"
        ? ctx.get("authorization")
        : (ctx.request.headers.authorization as string | undefined);
    const providedToken = extractBearerToken(authHeader);

    if (configuredToken) {
      if (!providedToken || providedToken !== configuredToken) {
        debug("Admin API unauthorized request: missing/invalid bearer token");
        ctx.status = 401;
        ctx.body = {
          success: false,
          error: "Unauthorized",
          message: "Admin API requires a valid bearer token.",
        } as AdminApiResponse;
        return;
      }
    } else {
      const requestIp = normalizeIp(
        ctx.ip || ctx.request.ip || ctx.req.socket.remoteAddress,
      );

      if (!isLoopbackIp(requestIp)) {
        debug(
          "Admin API forbidden request from non-loopback IP: %s",
          requestIp,
        );
        ctx.status = 403;
        ctx.body = {
          success: false,
          error: "Forbidden",
          message:
            "Admin API is restricted to localhost unless an admin token is configured.",
        } as AdminApiResponse;
        return;
      }
    }

    debug("Admin API request: %s %s", ctx.method, pathname);

    // Extract the resource path after the prefix
    const subPath = pathname.slice(pathPrefix.length);
    const parts = subPath.split("/").filter(Boolean);
    const [resource, ...rest] = parts;

    try {
      // ===== Health Check =====
      if (resource === "health" && ctx.method === "GET") {
        ctx.body = {
          status: "ok",
          port: config.port,
          uptime: process.uptime(),
          basePath: config.basePath,
          prefix: config.prefix,
        } as AdminApiResponse;
        return;
      }

      // ===== List All Contexts =====
      if (
        resource === "contexts" &&
        rest.length === 0 &&
        ctx.method === "GET"
      ) {
        const paths = contextRegistry.getAllPaths();
        const contexts = contextRegistry.getAllContexts();

        ctx.body = {
          success: true,
          data: {
            paths,
            contexts,
          },
        } as AdminApiResponse;
        return;
      }

      // ===== Get Specific Context =====
      if (resource === "contexts" && rest.length > 0 && ctx.method === "GET") {
        const path = "/" + rest.join("/");
        const context = contextRegistry.find(path);

        ctx.body = {
          success: true,
          data: {
            path,
            context,
          },
        } as AdminApiResponse;
        return;
      }

      // ===== Update Context =====
      if (resource === "contexts" && rest.length > 0 && ctx.method === "POST") {
        const path = "/" + rest.join("/");
        const newContextCandidate = ctx.request.body;

        if (
          !newContextCandidate ||
          typeof newContextCandidate !== "object" ||
          Array.isArray(newContextCandidate)
        ) {
          ctx.status = 400;
          ctx.body = {
            success: false,
            error: "Request body must be a valid, non-array JSON object",
          } as AdminApiResponse;
          return;
        }

        // Update the context using the registry's smart diffing
        const newContext = newContextCandidate as Context;
        contextRegistry.update(path, newContext);

        ctx.body = {
          success: true,
          message: `Context updated for path: ${path}`,
          data: {
            path,
            context: contextRegistry.find(path),
          },
        } as AdminApiResponse;
        return;
      }

      // ===== Get Full Config =====
      if (resource === "config" && rest.length === 0 && ctx.method === "GET") {
        ctx.body = {
          success: true,
          data: {
            alwaysFakeOptionals: config.alwaysFakeOptionals,
            adminApiTokenConfigured: Boolean(configuredToken),
            basePath: config.basePath,
            buildCache: config.buildCache,
            generate: config.generate,
            openApiPath: config.openApiPath,
            port: config.port,
            proxyUrl: config.proxyUrl,
            prefix: config.prefix,
            startAdminApi: config.startAdminApi ?? false,
            startRepl: config.startRepl,
            startServer: config.startServer,
            watch: config.watch,
            // Don't expose proxyPaths Map directly, convert to array
            proxyPaths: Array.from(config.proxyPaths.entries()),
          },
        } as AdminApiResponse;
        return;
      }

      // ===== Get Proxy Configuration =====
      if (
        resource === "config" &&
        rest[0] === "proxy" &&
        ctx.method === "GET"
      ) {
        ctx.body = {
          success: true,
          data: {
            proxyUrl: config.proxyUrl,
            proxyPaths: Array.from(config.proxyPaths.entries()),
          },
        } as AdminApiResponse;
        return;
      }

      // ===== Update Proxy Configuration =====
      if (
        resource === "config" &&
        rest[0] === "proxy" &&
        ctx.method === "PATCH"
      ) {
        const body = ctx.request.body as {
          proxyUrl?: string;
          proxyPaths?: Array<[string, boolean]>;
        };

        if (!body || typeof body !== "object") {
          ctx.status = 400;
          ctx.body = {
            success: false,
            error: "Request body must be a valid JSON object",
          } as AdminApiResponse;
          return;
        }

        // Update proxy URL if provided
        if (body.proxyUrl !== undefined) {
          if (typeof body.proxyUrl !== "string") {
            ctx.status = 400;
            ctx.body = {
              success: false,
              error: "proxyUrl must be a string",
            } as AdminApiResponse;
            return;
          }
          const proxyUrl = body.proxyUrl.trim();
          config.proxyUrl = proxyUrl;
          debug("Updated proxy URL to: %s", config.proxyUrl);
        }

        // Update proxy paths if provided
        if (Array.isArray(body.proxyPaths)) {
          for (const [path, enabled] of body.proxyPaths) {
            if (typeof path === "string" && typeof enabled === "boolean") {
              config.proxyPaths.set(path, enabled);
              debug("Set proxy for %s to %s", path, enabled);
            }
          }
        }

        ctx.body = {
          success: true,
          message: "Proxy configuration updated",
          data: {
            proxyUrl: config.proxyUrl,
            proxyPaths: Array.from(config.proxyPaths.entries()),
          },
        } as AdminApiResponse;
        return;
      }

      // ===== List All Routes =====
      if (resource === "routes" && ctx.method === "GET") {
        ctx.body = {
          success: true,
          data: {
            routes: registry.routes,
          },
        } as AdminApiResponse;
        return;
      }

      // ===== 404 for Unknown Endpoints =====
      ctx.status = 404;
      ctx.body = {
        success: false,
        error: "Not found",
        path: pathname,
        message: `Unknown admin API endpoint: ${pathname}`,
      } as AdminApiResponse;
    } catch (error) {
      // ===== 500 for Server Errors =====
      debug("Admin API error: %O", error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        stack:
          error instanceof Error && process.env.NODE_ENV !== "production"
            ? error.stack
            : undefined,
      } as AdminApiResponse;
    }
  };
}
