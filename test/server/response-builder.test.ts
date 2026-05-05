import { Config } from "../../src/server/config.ts";
import { createResponseBuilder } from "../../src/server/response-builder.js";
import type { OpenApiOperation } from "../../src/server/types.ts";
import retry from "jest-retries";

describe("a response builder", () => {
  it("starts building a response object when the status is selected", () => {
    const response = createResponseBuilder({
      responses: { 200: { content: {} } },
    });

    expect(response[200]?.status).toBe(200);
    expect(response["404 NOT FOUND"]?.status).toBe(404);
  });

  it("adds a content type and body with match()", () => {
    const response = createResponseBuilder({
      responses: { 200: { content: {}, schema: {} } },
    })[200]
      ?.match("text/plain", "hello")
      .match("application/json", { hello: "world" });

    expect(response?.status).toBe(200);
    expect(response?.content).toStrictEqual([
      { body: "hello", type: "text/plain" },
      { body: { hello: "world" }, type: "application/json" },
    ]);
  });

  it("has a binary() shortcut that stores a Buffer for application/octet-stream", () => {
    const buffer = Buffer.from("hello binary");
    const response = createResponseBuilder({
      responses: { 200: { content: {}, schema: {} } },
    })[200]?.binary(buffer);

    expect(response?.status).toBe(200);
    expect(response?.content).toStrictEqual([
      { body: buffer, type: "application/octet-stream" },
    ]);
  });

  it("has a binary() shortcut that decodes a base64 string to a Buffer", () => {
    const base64 = Buffer.from("hello binary").toString("base64");
    const response = createResponseBuilder({
      responses: { 200: { content: {}, schema: {} } },
    })[200]?.binary(base64);

    expect(response?.status).toBe(200);
    expect(Buffer.isBuffer(response?.content?.[0]?.body)).toBe(true);
    expect(response?.content?.[0]?.body).toStrictEqual(
      Buffer.from("hello binary"),
    );
  });

  it("has a binary() shortcut that converts a plain Uint8Array to a Buffer", () => {
    const uint8Array = new Uint8Array([1, 2, 3]);
    const response = createResponseBuilder({
      responses: { 200: { content: {}, schema: {} } },
    })[200]?.binary(uint8Array);

    expect(response?.status).toBe(200);
    expect(Buffer.isBuffer(response?.content?.[0]?.body)).toBe(true);
    expect(response?.content?.[0]?.body).toStrictEqual(Buffer.from([1, 2, 3]));
  });

  it("has shortcuts for json, text, and html", () => {
    const response = createResponseBuilder({
      responses: { 200: { content: {}, schema: {} } },
    })[200]
      ?.text("hello")
      .json({ hello: "world" })
      .html("<h1>Hello World</h1>")
      .xml({ hello: "world" });

    expect(response?.status).toBe(200);
    expect(response?.content).toStrictEqual([
      { body: "hello", type: "text/plain" },
      { body: { hello: "world" }, type: "application/json" },
      { body: { hello: "world" }, type: "text/json" },
      { body: { hello: "world" }, type: "text/x-json" },
      { body: "<h1>Hello World</h1>", type: "text/html" },
      {
        body: "<root><hello>world</hello></root>",
        type: "application/xml",
      },
      {
        body: "<root><hello>world</hello></root>",
        type: "text/xml",
      },
    ]);
  });

  it("returns a response with no body when empty() is called", () => {
    const response = createResponseBuilder({
      responses: { 204: {} },
    })[204]?.empty();

    expect(response?.status).toBe(204);
    expect(response?.content).toBeUndefined();
  });

  it("adds headers", () => {
    const response = createResponseBuilder({
      responses: { 200: { content: {}, schema: {} } },
    })[200]
      ?.header("x-one", "one")
      .header("x-two", "2");

    expect(response?.status).toBe(200);
    expect(response?.headers).toStrictEqual({
      "x-one": "one",
      "x-two": "2",
    });
  });

  it("adds a single cookie", () => {
    const response = createResponseBuilder({
      responses: { 200: { content: {}, schema: {} } },
    })[200]?.cookie("sessionId", "abc123");

    expect(response?.status).toBe(200);
    expect(response?.headers?.["set-cookie"]).toStrictEqual([
      "sessionId=abc123",
    ]);
  });

  it("adds multiple cookies via chaining", () => {
    const response = createResponseBuilder({
      responses: { 200: { content: {}, schema: {} } },
    })[200]
      ?.cookie("sessionId", "abc123")
      .cookie("theme", "dark");

    expect(response?.status).toBe(200);
    expect(response?.headers?.["set-cookie"]).toStrictEqual([
      "sessionId=abc123",
      "theme=dark",
    ]);
  });

  it("serializes all supported cookie options", () => {
    const expires = new Date("2025-12-31T00:00:00.000Z");

    const response = createResponseBuilder({
      responses: { 200: { content: {}, schema: {} } },
    })[200]?.cookie("a", "1", {
      domain: "example.com",
      expires,
      httpOnly: true,
      maxAge: 3600,
      path: "/",
      sameSite: "lax",
      secure: true,
    });

    expect(response?.headers?.["set-cookie"]).toStrictEqual([
      `a=1; Path=/; Domain=example.com; Max-Age=3600; Expires=${expires.toUTCString()}; HttpOnly; Secure; SameSite=Lax`,
    ]);
  });

  it("serializes sameSite=strict correctly", () => {
    const response = createResponseBuilder({
      responses: { 200: { content: {}, schema: {} } },
    })[200]?.cookie("a", "1", { sameSite: "strict" });

    expect(response?.headers?.["set-cookie"]).toStrictEqual([
      "a=1; SameSite=Strict",
    ]);
  });

  it("serializes sameSite=none correctly", () => {
    const response = createResponseBuilder({
      responses: { 200: { content: {}, schema: {} } },
    })[200]?.cookie("a", "1", { sameSite: "none" });

    expect(response?.headers?.["set-cookie"]).toStrictEqual([
      "a=1; SameSite=None",
    ]);
  });

  it("chains cookie() before json()", () => {
    const response = createResponseBuilder({
      responses: { 200: { content: {}, schema: {} } },
    })[200]
      ?.cookie("sessionId", "abc123")
      .json({ ok: true });

    expect(response?.headers?.["set-cookie"]).toStrictEqual([
      "sessionId=abc123",
    ]);
    expect(response?.content).toContainEqual({
      body: { ok: true },
      type: "application/json",
    });
  });

  it("chains json() before cookie()", () => {
    const response = createResponseBuilder({
      responses: { 200: { content: {}, schema: {} } },
    })[200]
      ?.json({ ok: true })
      .cookie("sessionId", "abc123");

    expect(response?.headers?.["set-cookie"]).toStrictEqual([
      "sessionId=abc123",
    ]);
    expect(response?.content).toContainEqual({
      body: { ok: true },
      type: "application/json",
    });
  });

  describe("builds a random response based on an Open API operation object", () => {
    const operation: OpenApiOperation = {
      responses: {
        200: {
          content: {
            "application/json": {
              schema: {
                additionalProperties: false,

                properties: {
                  value: {
                    examples: ["hello"],
                    required: true,
                    type: "string",
                  },
                },

                type: "object",
              },
            },

            "text/plain": {
              examples: {
                text: {
                  description: "a text response",
                  summary: "summary",
                  value: "example text response",
                },
              },

              schema: {
                examples: ["hello"],
                type: "string",
              },
            },
          },
        },

        default: {
          content: {
            "text/plain": {
              schema: {
                examples: ["an error occurred"],
                type: "string",
              },
            },
          },
        },
      },
    };

    it("using the status code", async () => {
      const response = await createResponseBuilder(operation)[200]?.random();

      expect(response?.status).toBe(200);

      expect(response?.content?.[1]).toStrictEqual({
        body: "example text response",
        type: "text/plain",
      });

      // Something in json-schema-faker changed so this is no longer deterministic
      //
      // expect(response?.content?.[0]).toStrictEqual({
      //   body: { value: "hello" },
      //   type: "application/json",
      // });
    });

    it("fills in required headers when calling random()", async () => {
      const operationWithRequiredHeaders: OpenApiOperation = {
        responses: {
          200: {
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
            headers: {
              "x-required-header": {
                required: true,
                schema: { type: "string", examples: ["header-value"] },
              },
              "x-optional-header": {
                required: false,
                schema: { type: "string" },
              },
            },
          },
        },
      };

      const response = await createResponseBuilder(
        operationWithRequiredHeaders,
      )[200]?.random();

      expect(response?.status).toBe(200);
      expect(response?.headers?.["x-required-header"]).toBeDefined();
      expect(response?.headers?.["x-optional-header"]).toBeUndefined();
    });

    it("does not overwrite an already-set required header when calling random()", async () => {
      const operationWithRequiredHeaders: OpenApiOperation = {
        responses: {
          200: {
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
            headers: {
              "x-required-header": {
                required: true,
                schema: { type: "string" },
              },
            },
          },
        },
      };

      const response = await createResponseBuilder(
        operationWithRequiredHeaders,
      )[200]
        ?.header("x-required-header", "already-set")
        .random();

      expect(response?.headers?.["x-required-header"]).toBe("already-set");
    });

    it("correctly handles alwaysFakeOptionals option", async () => {
      const operationWithoutExamples: OpenApiOperation = {
        responses: {
          200: {
            content: {
              "application/json": {
                schema: {
                  additionalProperties: false,

                  properties: {
                    value: {
                      required: true,
                      type: "string",
                    },
                    label: {
                      nullable: true,
                      type: "string",
                    },
                  },

                  type: "object",
                },
              },
            },
          },

          default: {
            content: {
              "text/plain": {
                schema: {
                  examples: ["an error occurred"],
                  type: "string",
                },
              },
            },
          },
        },
      };
      const response = await createResponseBuilder(operationWithoutExamples, {
        alwaysFakeOptionals: true,
      } as Config)[200]?.random();

      expect(response?.status).toBe(200);
      expect(
        (response.content?.[0]?.body as { label?: string })?.label,
      ).toBeDefined();
    });

    it("falls back to 'default' when status code is not listed explicitly", async () => {
      const response = await createResponseBuilder(operation)[403]?.random();

      expect(response?.status).toBe(403);
      expect(response?.content).toStrictEqual([
        { body: "an error occurred", type: "text/plain" },
      ]);
    });

    it("returns 500 if it doesn't know what to do with the status code", async () => {
      const operationWithoutDefault = { ...operation };

      delete operationWithoutDefault.responses.default;

      const response = await createResponseBuilder(
        operationWithoutDefault,
      )[403]?.random();

      expect(response?.status).toBe(500);
      expect(response?.content).toStrictEqual([
        {
          body: "The Open API document does not specify a response for status code 403",
          type: "text/plain",
        },
      ]);
    });

    it("returns a null or undefined body for invalid schema types", async () => {
      const operationWithInvalidSchema = structuredClone(operation);

      operationWithInvalidSchema.responses[200].content[
        "application/json"
      ].schema.type = "file";

      const response = await createResponseBuilder(
        operationWithInvalidSchema,
      )[200]?.random();
      const jsonBody = response?.content?.[0]?.body;

      expect(response?.status).toBe(200);
      expect(response?.content?.[0]?.type).toBe("application/json");
      // json-schema-faker returns null or undefined for invalid schema types
      expect([null, undefined]).toContain(jsonBody);
      expect(response?.content?.[1]).toStrictEqual({
        body: "example text response",
        type: "text/plain",
      });
    });
  });

  describe("selects a named example from an Open API operation object", () => {
    const operation: OpenApiOperation = {
      responses: {
        200: {
          content: {
            "application/json": {
              examples: {
                success: {
                  description: "a success response",
                  summary: "success",
                  value: { id: 1, name: "test" },
                },
                empty: {
                  description: "an empty response",
                  summary: "empty",
                  value: [],
                },
              },

              schema: {
                type: "object",
              },
            },

            "text/plain": {
              examples: {
                success: {
                  description: "a plain text success",
                  summary: "success",
                  value: "ok",
                },
              },

              schema: {
                type: "string",
              },
            },
          },
        },
      },
    };

    it("returns the named example value for each content type", () => {
      const response =
        createResponseBuilder(operation)[200]?.example("success");

      expect(response?.status).toBe(200);
      expect(response?.content).toStrictEqual([
        { body: { id: 1, name: "test" }, type: "application/json" },
        { body: "ok", type: "text/plain" },
      ]);
    });

    it("returns an example not present in all content types as undefined body", () => {
      const response = createResponseBuilder(operation)[200]?.example("empty");

      expect(response?.status).toBe(200);
      expect(response?.content).toStrictEqual([
        { body: [], type: "application/json" },
        { body: undefined, type: "text/plain" },
      ]);
    });

    it("returns 500 for OpenAPI 2 (produces) operations since named examples are not supported", () => {
      const legacyOperation: OpenApiOperation = {
        produces: ["application/json"],
        responses: {
          200: {
            examples: { "application/json": "value" },
            schema: { type: "object" },
          },
        },
      };

      const response =
        createResponseBuilder(legacyOperation)[200]?.example("success");

      expect(response?.status).toBe(500);
    });

    it("returns 500 when the example name does not exist in any content type", () => {
      const response = createResponseBuilder(operation)[200]?.example(
        "nonexistent-example",
      );

      expect(response?.status).toBe(500);
      expect(response?.content).toStrictEqual([
        {
          body: 'The OpenAPI document does not define an example named "nonexistent-example" for status code 200',
          type: "text/plain",
        },
      ]);
    });
  });

  describe("builds a random response based on an Open API operation object (OpenAPI 2)", () => {
    const operation: OpenApiOperation = {
      produces: ["application/json", "text/plain"],

      responses: {
        200: {
          examples: { text: "example response" },

          schema: {
            additionalProperties: false,

            properties: {
              value: {
                examples: ["hello"],
                required: true,
                type: "string",
              },
            },

            type: "object",
          },
        },

        default: {
          schema: {
            examples: ["an error occurred"],
            type: "string",
          },
        },
      },
    };

    retry("using the status code", 10, async () => {
      const response = await createResponseBuilder(operation)[200]?.random();

      // eslint-disable-next-line jest/no-standalone-expect
      expect(response?.status).toBe(200);
      // eslint-disable-next-line jest/no-standalone-expect
      expect(response?.content).toStrictEqual([
        { body: "example response", type: "application/json" },
        { body: "example response", type: "text/plain" },
      ]);
    });

    it("falls back to 'default' when status code is not listed explicitly", async () => {
      const response = await createResponseBuilder(operation)[403]?.random();

      expect(response?.status).toBe(403);
      expect(response?.content).toStrictEqual([
        { body: "an error occurred", type: "application/json" },
        { body: "an error occurred", type: "text/plain" },
      ]);
    });

    it("returns 500 if it doesn't know what to do with the status code", async () => {
      const operationWithoutDefault = { ...operation };

      delete operationWithoutDefault.responses.default;

      const response = await createResponseBuilder(
        operationWithoutDefault,
      )[403]?.random();

      expect(response?.status).toBe(500);
      expect(response?.content).toStrictEqual([
        {
          body: "The Open API document does not specify a response for status code 403",
          type: "text/plain",
        },
      ]);
    });
  });

  describe("stream()", () => {
    async function* makeStream(items: unknown[]) {
      for (const item of items) {
        yield item;
      }
    }

    it("returns a response object with body set to the async iterable", () => {
      const iterable = makeStream([{ id: 1 }]);
      const response = createResponseBuilder({ responses: {} })[200]?.stream(
        iterable,
      );

      expect(response?.body).toBe(iterable);
    });

    it("defaults content type to text/event-stream", () => {
      const response = createResponseBuilder({ responses: {} })[200]?.stream(
        makeStream([]),
      );

      expect(response?.contentType).toBe("text/event-stream");
    });

    it("accepts a custom content type", () => {
      const response = createResponseBuilder({ responses: {} })[200]?.stream(
        makeStream([]),
        "application/jsonl",
      );

      expect(response?.contentType).toBe("application/jsonl");
    });

    it("preserves the status code", () => {
      const response = createResponseBuilder({ responses: {} })[202]?.stream(
        makeStream([]),
      );

      expect(response?.status).toBe(202);
    });
  });
});
