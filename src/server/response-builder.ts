import { generate, type JsonSchema } from "json-schema-faker";

import { jsonToXml } from "./json-to-xml.js";
import type {
  CookieOptions,
  OpenApiOperation,
  ResponseBuilder,
} from "../counterfact-types/index.js";
import type { Config } from "./config.js";

const DEFAULT_GENERATE_OPTIONS = {
  useExamplesValue: true,
  minItems: 0,
  maxItems: 20,
  failOnInvalidTypes: false,
  fillProperties: false,
} as const;

function convertToXmlIfNecessary(
  type: string,
  body: unknown,
  schema?: { [key: string]: unknown },
) {
  if (type.endsWith("/xml")) {
    return jsonToXml(body, schema, "root");
  }

  return body;
}

function oneOf(items: unknown[] | { [key: string]: unknown }): unknown {
  if (Array.isArray(items)) {
    return items[Math.floor(Math.random() * items.length)];
  }

  return oneOf(Object.values(items));
}

function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions = {},
): string {
  const parts = [`${name}=${value}`];

  if (options.path !== undefined) {
    parts.push(`Path=${options.path}`);
  }

  if (options.domain !== undefined) {
    parts.push(`Domain=${options.domain}`);
  }

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options.expires !== undefined) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  if (options.sameSite !== undefined) {
    const sameSiteMap = { lax: "Lax", none: "None", strict: "Strict" };

    parts.push(`SameSite=${sameSiteMap[options.sameSite]}`);
  }

  return parts.join("; ");
}

function unknownStatusCodeResponse(statusCode: number | undefined) {
  return {
    content: [
      {
        body: `The Open API document does not specify a response for status code ${
          statusCode ?? '""'
        }`,

        type: "text/plain",
      },
    ],

    status: 500,
  };
}

/**
 * Creates the `$.response` builder proxy made available to route handlers.
 *
 * The proxy maps HTTP status codes to a fluent builder object.  Example usage
 * in a route handler:
 *
 * ```ts
 * return $.response[200].json({ id: 1, name: "Fluffy" });
 * ```
 *
 * @param operation - The OpenAPI operation descriptor used for schema-driven
 *   random generation and example resolution.
 * @param config - Server configuration (e.g. `alwaysFakeOptionals`).
 * @returns A {@link ResponseBuilder} proxy keyed by HTTP status code.
 */
export function createResponseBuilder(
  operation: OpenApiOperation,
  config?: Pick<Config, "alwaysFakeOptionals">,
): ResponseBuilder {
  return new Proxy({} as ResponseBuilder, {
    get: (target, statusCode: string) => ({
      header(
        this: ResponseBuilder,
        name: string,
        value: string,
      ): ResponseBuilder {
        return {
          ...this,

          headers: {
            ...this.headers,
            [name]: value,
          },
        };
      },

      binary(this: ResponseBuilder, body: Uint8Array | string) {
        const buffer =
          typeof body === "string"
            ? Buffer.from(body, "base64")
            : Buffer.from(body);

        return this.match("application/octet-stream", buffer);
      },

      cookie(
        this: ResponseBuilder,
        name: string,
        value: string,
        options: CookieOptions = {},
      ): ResponseBuilder {
        const cookieString = serializeCookie(name, value, options);
        const existing = this.headers?.["set-cookie"];
        const existingArray: string[] = Array.isArray(existing)
          ? existing
          : existing !== undefined
            ? [existing]
            : [];

        return {
          ...this,

          headers: {
            ...this.headers,
            "set-cookie": [...existingArray, cookieString],
          },
        };
      },

      html(this: ResponseBuilder, body: unknown) {
        return this.match("text/html", body);
      },

      json(this: ResponseBuilder, body: unknown) {
        return this.match("application/json", body)
          .match("text/json", body)
          .match("text/x-json", body)
          .match("application/xml", body)
          .match("text/xml", body);
      },

      match(
        this: ResponseBuilder,
        contentType: string,
        body: unknown,
      ): ResponseBuilder {
        return {
          ...this,

          content: [
            ...(this.content ?? []).filter(
              (response) => response.type !== contentType,
            ),
            {
              body: convertToXmlIfNecessary(
                contentType,
                body,
                operation.responses[this.status ?? "default"]?.content?.[
                  contentType
                ]?.schema,
              ),

              type: contentType,
            },
          ],
        };
      },

      empty(this: ResponseBuilder): ResponseBuilder {
        return { ...this, content: undefined };
      },

      example(this: ResponseBuilder, name: string) {
        if (operation.produces) {
          return unknownStatusCodeResponse(this.status);
        }

        const response =
          operation.responses[this.status ?? "default"] ??
          operation.responses.default;

        if (response?.content === undefined) {
          return unknownStatusCodeResponse(this.status);
        }

        const { content } = response;

        const exampleExists = Object.values(content).some(
          (contentType) => contentType?.examples?.[name] !== undefined,
        );

        if (!exampleExists) {
          return {
            content: [
              {
                body: `The OpenAPI document does not define an example named "${name}" for status code ${this.status ?? "unknown"}`,
                type: "text/plain",
              },
            ],
            status: 500,
          };
        }

        return {
          ...this,

          content: Object.keys(content).map((type) => ({
            body: convertToXmlIfNecessary(
              type,
              content[type]?.examples?.[name]?.value,
              content[type]?.schema,
            ),

            type,
          })),
        };
      },

      async random(this: ResponseBuilder) {
        const generateOptions = config?.alwaysFakeOptionals
          ? {
              ...DEFAULT_GENERATE_OPTIONS,
              alwaysFakeOptionals: true,
              fixedProbabilities: true,
              optionalsProbability: 1.0,
            }
          : DEFAULT_GENERATE_OPTIONS;

        if (operation.produces) {
          return this.randomLegacy();
        }

        const response =
          operation.responses[this.status ?? "default"] ??
          operation.responses.default;

        if (response?.content === undefined) {
          return unknownStatusCodeResponse(this.status);
        }

        const { content } = response;

        const generatedHeaders: { [name: string]: string } = {};

        for (const [name, header] of Object.entries(response.headers ?? {})) {
          if (header.required && !(name in (this.headers ?? {}))) {
            generatedHeaders[name] = (await generate(
              (header.schema ?? { type: "string" }) as JsonSchema,
              generateOptions,
            )) as string;
          }
        }

        return {
          ...this,

          content: await Promise.all(
            Object.keys(content).map(async (type) => ({
              body: convertToXmlIfNecessary(
                type,
                content[type]?.examples
                  ? oneOf(
                      Object.values(content[type]?.examples ?? []).map(
                        (example) => example.value,
                      ),
                    )
                  : await generate(
                      (content[type]?.schema ?? {
                        type: "object",
                      }) as JsonSchema,
                      generateOptions,
                    ),
                content[type]?.schema,
              ),

              type,
            })),
          ),

          headers: {
            ...generatedHeaders,
            ...this.headers,
          },
        };
      },

      async randomLegacy(this: ResponseBuilder) {
        const response =
          operation.responses[this.status ?? "default"] ??
          operation.responses.default;

        if (response === undefined) {
          return unknownStatusCodeResponse(this.status);
        }

        const body = response.examples
          ? oneOf(response.examples)
          : await generate(
              (response.schema ?? { type: "object" }) as JsonSchema,
              DEFAULT_GENERATE_OPTIONS,
            );

        return {
          ...this,

          content: operation.produces?.map((type) => ({
            body,
            type,
          })),
        };
      },

      stream(
        this: ResponseBuilder,
        iterable: AsyncIterable<unknown>,
        contentType = "text/event-stream",
      ) {
        return {
          body: iterable,
          contentType,
          headers: this.headers,
          status: this.status,
        };
      },

      status: Number.parseInt(statusCode, 10),

      text(this: ResponseBuilder, body: unknown) {
        return this.match("text/plain", body);
      },

      xml(this: ResponseBuilder, body: unknown) {
        return this.match("application/xml", body).match("text/xml", body);
      },
    }),
  });
}

export type { OpenApiOperation };
