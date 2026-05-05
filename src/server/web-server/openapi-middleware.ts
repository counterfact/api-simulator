import { bundle } from "@apidevtools/json-schema-ref-parser";
import { dump } from "js-yaml";
import type Koa from "koa";

export interface OpenApiDocumentConfig {
  path: string;
  baseUrl: string;
}

/**
 * Returns a Koa middleware that serves a bundled OpenAPI document as YAML at
 * the given `pathPrefix`.
 *
 * The served document is augmented with a `servers` entry (OpenAPI 3.x) and a
 * `host` field (OpenAPI 2.x / Swagger) so that the Swagger UI can send
 * requests to the running Counterfact instance.
 *
 * @param pathPrefix - The URL path at which to serve the document, e.g.
 *   `"/counterfact/openapi"`. Requests to any other path fall through to the
 *   next middleware.
 * @param document - Descriptor providing `path` (file path or URL to the
 *   source OpenAPI document) and `baseUrl` (the base URL to inject, e.g.
 *   `"//localhost:3100/api"`).
 * @returns A Koa middleware function.
 */
export function openapiMiddleware(
  pathPrefix: string,
  document: OpenApiDocumentConfig,
): Koa.Middleware {
  return async (ctx: Koa.ExtendableContext, next: Koa.Next) => {
    if (ctx.URL.pathname !== pathPrefix) {
      return await next();
    }

    const openApiDocument = (await bundle(document.path)) as {
      host?: string;
      servers?: { name?: string; description: string; url: string }[];
    };

    openApiDocument.servers ??= [];

    openApiDocument.servers.unshift({
      name: "Counterfact",
      description: "Counterfact",
      url: document.baseUrl,
    });

    // OpenApi 2 support:
    openApiDocument.host = document.baseUrl;

    ctx.body = dump(openApiDocument);
  };
}
