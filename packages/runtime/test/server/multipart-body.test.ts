import { Readable } from "node:stream";
import { jest } from "@jest/globals";
import type Koa from "koa";
import { Response as FetchResponse } from "node-fetch";

import {
  multipartBodyParser,
  MULTIPART_BODY_LIMIT,
} from "../../src/server/web-server/multipart-body-parser.js";
import {
  normalizeMultipartBody,
  multipartValidationSchema,
} from "../../src/server/multipart-body.js";
import { validateRequest } from "../../src/server/request-validator.js";
import { ContextRegistry } from "../../src/server/context-registry.js";
import { Dispatcher } from "../../src/server/dispatcher.js";
import { Registry } from "../../src/server/registry.js";

const schema = {
  type: "object",
  required: ["name", "files"],
  properties: {
    name: { type: "string" },
    count: { type: "integer" },
    enabled: { type: "boolean" },
    tags: {
      anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }],
    },
    files: { type: "array", items: { type: "string", format: "binary" } },
  },
};

function context(bytes: Buffer[], contentType: string, length?: number) {
  const request: { body?: unknown; rawBody?: Buffer } = {};
  return {
    req: Readable.from(bytes),
    request,
    method: "POST",
    is: (type: string) => contentType.split(";")[0] === type,
    get: (header: string) =>
      header === "content-type" ? contentType : String(length ?? ""),
    throw: (status: number, message: string) => {
      throw Object.assign(new Error(message), { status });
    },
  } as unknown as Koa.Context;
}

async function encodedForm() {
  const form = new FormData();
  form.append("name", "Narrator");
  form.append("count", "3");
  form.append("enabled", "false");
  form.append("tags", "one");
  form.append(
    "files",
    new Blob([new Uint8Array([0, 255, 128])], { type: "audio/wav" }),
    "voice.wav",
  );
  form.append("files", new Blob([]), "empty.bin");
  const encoded = new Response(form);
  return {
    bytes: Buffer.from(await encoded.arrayBuffer()),
    contentType: encoded.headers.get("content-type")!,
  };
}

describe("multipart parsing and dispatch", () => {
  it("parses real multipart wire bytes and dispatches normalized typed fields and uploads", async () => {
    const { bytes, contentType } = await encodedForm();
    const ctx = context(
      [bytes.subarray(0, 31), bytes.subarray(31)],
      contentType,
    );
    const handler = jest.fn(({ body }) => ({
      status: 200,
      body,
      contentType: "application/json",
    }));
    const registry = new Registry();
    registry.add("/upload", { POST: handler });
    const dispatcher = new Dispatcher(
      registry,
      new ContextRegistry(),
      {
        paths: {
          "/upload": {
            post: {
              requestBody: {
                required: true,
                content: { "multipart/form-data": { schema } },
              },
              responses: {},
            },
          },
        },
      },
      { validateResponses: false },
    );
    let response;
    await multipartBodyParser()(ctx, async () => {
      response = await dispatcher.request({
        method: "POST",
        path: "/upload",
        body: ctx.request.body,
        headers: { "content-type": contentType },
        query: {},
        req: {},
        rawBody: ctx.request.rawBody,
      });
    });
    expect(response.status).toBe(200);
    const body = handler.mock.calls[0][0].body;
    expect(body).toMatchObject({
      name: "Narrator",
      count: 3,
      enabled: false,
      tags: ["one"],
    });
    expect(body.files).toHaveLength(2);
    expect(body.files[0]).toEqual({
      data: new Uint8Array([0, 255, 128]),
      filename: "voice.wav",
      contentType: "audio/wav",
      size: 3,
    });
    expect(body.files[1]).toMatchObject({ filename: "empty.bin", size: 0 });
    expect(ctx.request.rawBody).toEqual(bytes);
  });

  it("forwards the original binary body and boundary through $.proxy", async () => {
    const { bytes, contentType } = await encodedForm();
    const ctx = context([bytes], contentType);
    const registry = new Registry();
    registry.add("/upload", {
      POST: ({ proxy }) => proxy("https://example.test/upload"),
    });
    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    dispatcher.fetch = jest.fn<typeof dispatcher.fetch>(
      async (_url, options) => {
        expect(options?.body).toEqual(bytes);
        expect(
          new Headers(options?.headers as Record<string, string>).get(
            "content-type",
          ),
        ).toBe(contentType);
        return new FetchResponse("forwarded", { status: 200 });
      },
    );
    await multipartBodyParser()(ctx, async () => {
      const response = await dispatcher.request({
        method: "POST",
        path: "/upload",
        body: ctx.request.body,
        headers: { "content-type": contentType },
        query: {},
        req: {},
        rawBody: ctx.request.rawBody,
      });
      expect(response).toMatchObject({ status: 200, body: "forwarded" });
    });
    expect(dispatcher.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["multipart/form-data", "missing boundary"],
    [
      "multipart/form-data; boundary=test",
      '--test\r\nContent-Disposition: form-data; name="name"\r\n\r\ntruncated',
    ],
  ])("rejects malformed wire data for %s", async (contentType, wire) => {
    const next = jest.fn(async () => {});
    await expect(
      multipartBodyParser()(context([Buffer.from(wire)], contentType), next),
    ).rejects.toMatchObject({ status: 400 });
    expect(next).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "enforces upload limits with declared length: %s",
    async (declared) => {
      const ctx = context(
        [Buffer.alloc(MULTIPART_BODY_LIMIT), Buffer.from("x")],
        "multipart/form-data; boundary=test",
        declared ? MULTIPART_BODY_LIMIT + 1 : undefined,
      );
      const next = jest.fn(async () => {});
      await expect(multipartBodyParser()(ctx, next)).rejects.toMatchObject({
        status: 413,
      });
      expect(next).not.toHaveBeenCalled();
    },
  );

  it("leaves other content types to the existing parser", async () => {
    const ctx = context(
      [Buffer.from('{"name":"Narrator"}')],
      "application/json",
    );
    const next = jest.fn(async () => {});
    await multipartBodyParser()(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.request.body).toBeUndefined();
  });

  it.each([
    {},
    { name: "Narrator", files: "not a file" },
    { name: ["one", "two"], files: [] },
    { name: "Narrator", count: "invalid", files: [] },
  ])(
    "validates required fields, repetitions and declared types: %j",
    (body) => {
      const result = validateRequest(
        {
          requestBody: { content: { "multipart/form-data": { schema } } },
          responses: {},
        },
        {
          body: normalizeMultipartBody(body, schema),
          headers: { "content-type": "multipart/form-data; boundary=test" },
          cookie: {},
          query: {},
        },
      );
      expect(result.valid).toBe(false);
    },
  );

  it("transforms multipart validation without mutating JSON schemas", () => {
    const before = JSON.stringify(schema);
    const transformed = multipartValidationSchema(schema);
    expect(transformed).toMatchObject({
      properties: { files: { items: { counterfactMultipartFile: true } } },
    });
    expect(JSON.stringify(schema)).toBe(before);
    expect(multipartValidationSchema(schema)).toBe(transformed);
  });

  it("selects schemas using the request content type", () => {
    const operation = {
      responses: {},
      requestBody: {
        content: {
          "application/json": {
            schema: { type: "object", required: ["json"] },
          },
          "multipart/form-data": {
            schema: { type: "object", required: ["name"] },
          },
          "application/x-www-form-urlencoded": {
            schema: { type: "object", required: ["form"] },
          },
        },
      },
    };
    for (const [contentType, body] of [
      ["application/json", { json: true }],
      ["multipart/form-data", { name: "Narrator" }],
      ["application/x-www-form-urlencoded", { form: "value" }],
    ]) {
      expect(
        validateRequest(operation, {
          body,
          headers: { "content-type": contentType as string },
          cookie: {},
          query: {},
        }).valid,
      ).toBe(true);
    }
  });
});
