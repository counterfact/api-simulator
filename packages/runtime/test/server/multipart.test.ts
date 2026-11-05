import { jest } from "@jest/globals";
import request from "supertest";

import { createKoaApp } from "../../src/koa.js";
import { ContextRegistry } from "../../src/server/context-registry.js";
import { Dispatcher } from "../../src/server/dispatcher.js";
import { Registry } from "../../src/server/registry.js";
import { MULTIPART_BODY_LIMIT } from "../../src/server/web-server/multipart-body-parser.js";
import { isMultipartFile } from "../../src/server/multipart-body.js";

const schema = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    files: { type: "array", items: { type: "string", format: "binary" } },
    avatar: { type: "string", format: "binary" },
    count: { type: "integer" },
    enabled: { type: "boolean" },
    labels: { type: "object", properties: { accent: { type: "string" } } },
  },
};

function appForUpload(required = true) {
  const registry = new Registry();
  const contextRegistry = new ContextRegistry();
  const handler = jest.fn(({ body }) => ({
    status: 200,
    contentType: "application/json",
    body: { received: body },
  }));
  registry.add("/upload", {
    POST: handler,
    PUT: handler,
    PATCH: handler,
    DELETE: handler,
  });
  const content = Object.fromEntries(
    [
      "multipart/form-data",
      "application/json",
      "application/x-www-form-urlencoded",
    ].map((type) => [type, { schema }]),
  );
  const operation = {
    requestBody: { required, content },
    responses: { 200: { description: "Received" } },
  };
  const dispatcher = new Dispatcher(registry, contextRegistry, {
    paths: {
      "/upload": {
        post: operation,
        put: operation,
        patch: operation,
        delete: operation,
      },
    },
  });
  const app = createKoaApp({
    runners: [
      {
        registry,
        contextRegistry,
        dispatcher,
        openApiPath: "unused",
        overlays: [],
        prefix: "",
        subdirectory: "",
      },
    ],
    config: {
      basePath: ".",
      port: 0,
      proxyPaths: new Map(),
      proxyUrl: "",
      startAdminApi: false,
    },
  });
  return { app, handler, dispatcher };
}

describe("multipart requests over HTTP", () => {
  it.each(["post", "put", "patch", "delete"] as const)(
    "delivers text on %s requests",
    async (method) => {
      const { app, handler } = appForUpload();
      const agent = request(app.callback());
      const response = await agent[method]("/upload").field("name", "Narrator");
      expect(response.status).toBe(200);
      expect(handler.mock.calls[0][0].body).toEqual({ name: "Narrator" });
    },
  );

  it("decodes declared arrays and primitives and preserves uploaded bytes and metadata", async () => {
    const { app, handler } = appForUpload();
    const bytes = Buffer.from([0, 255, 13, 10, 128]);
    const response = await request(app.callback())
      .post("/upload")
      .field("name", "Updated Narrator")
      .field("tags", "one")
      .field("tags", "two")
      .field("count", "3")
      .field("enabled", "false")
      .field("labels", '{"accent":"British"}')
      .attach("files", bytes, {
        filename: "voice.wav",
        contentType: "audio/wav",
      })
      .attach("avatar", Buffer.alloc(0), {
        filename: "empty.png",
        contentType: "image/png",
      });
    expect(response.status).toBe(200);
    const body = handler.mock.calls[0][0].body;
    expect(body).toMatchObject({
      name: "Updated Narrator",
      tags: ["one", "two"],
      count: 3,
      enabled: false,
      labels: { accent: "British" },
    });
    expect(body.files).toHaveLength(1);
    expect(isMultipartFile(body.files[0])).toBe(true);
    expect(Buffer.from(body.files[0].data)).toEqual(bytes);
    expect(body.files[0]).toMatchObject({
      filename: "voice.wav",
      contentType: "audio/wav",
      size: 5,
    });
    expect(body.avatar).toMatchObject({
      filename: "empty.png",
      contentType: "image/png",
      size: 0,
    });
  });

  it("keeps repeated files in order and wraps singleton text arrays", async () => {
    const { app, handler } = appForUpload();
    const response = await request(app.callback())
      .post("/upload")
      .field("name", "Narrator")
      .field("tags", "one")
      .attach("files", Buffer.from("first"), "first.txt")
      .attach("files", Buffer.from("second"), "second.txt");
    expect(response.status).toBe(200);
    const { files, tags } = handler.mock.calls[0][0].body;
    expect(tags).toEqual(["one"]);
    expect(files.map((file) => file.filename)).toEqual([
      "first.txt",
      "second.txt",
    ]);
  });

  it.each([
    [["tags", "one"]],
    [
      ["name", "one"],
      ["name", "two"],
    ],
    [
      ["name", "Narrator"],
      ["count", "oops"],
    ],
    [
      ["name", "Narrator"],
      ["avatar", "not a file"],
    ],
  ])(
    "rejects invalid fields %j without calling the handler",
    async (fields) => {
      const { app, handler } = appForUpload();
      let upload = request(app.callback()).post("/upload");
      for (const [name, value] of fields) upload = upload.field(name, value);
      const response = await upload;
      expect(response.status).toBe(400);
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["multipart/form-data", "not multipart"],
    [
      "multipart/form-data; boundary=test",
      '--test\r\nContent-Disposition: form-data; name="name"\r\n\r\ntruncated',
    ],
  ])(
    "rejects malformed multipart with content type %s",
    async (contentType, body) => {
      const { app, handler } = appForUpload();
      const response = await request(app.callback())
        .post("/upload")
        .set("Content-Type", contentType)
        .send(body);
      expect(response.status).toBe(400);
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it("rejects uploads declared larger than 10 MiB before reading the body", async () => {
    const { app, handler } = appForUpload();
    const response = await request(app.callback())
      .post("/upload")
      .set("Content-Type", "multipart/form-data; boundary=limit")
      .set("Content-Length", String(MULTIPART_BODY_LIMIT + 1))
      .send("rejected before reading");
    expect(response.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(["json", "form"])(
    "preserves %s requests and selects their declared schema",
    async (type) => {
      const { app, handler } = appForUpload();
      const response = await request(app.callback())
        .post("/upload")
        .type(type)
        .send({ name: "Narrator" });
      expect(response.status).toBe(200);
      expect(handler.mock.calls[0][0].body).toEqual({ name: "Narrator" });
    },
  );
});

it("preserves optional body absence without dropping parsed multipart fields", async () => {
  const { app, handler } = appForUpload(false);
  const agent = request(app.callback());
  expect((await agent.post("/upload")).status).toBe(200);
  expect(handler.mock.calls[0][0].body).toBeUndefined();
  expect((await agent.post("/upload").field("name", "Present")).status).toBe(
    200,
  );
  expect(handler.mock.calls[1][0].body).toEqual({ name: "Present" });
  expect((await agent.post("/upload").field("count", "3")).status).toBe(400);
  expect(handler).toHaveBeenCalledTimes(2);
});
