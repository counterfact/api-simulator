import { jest } from "@jest/globals";
import { usingTemporaryFiles } from "using-temporary-files";
import type { SchemaTypeTransform } from "@counterfact/generator";
import { counterfact } from "../src/app.js";

const spec = {
  openapi: "3.0.3",
  info: { title: "Lifecycle", version: "1" },
  paths: {
    "/items": {
      get: {
        responses: {
          "200": {
            description: "ok",
            content: { "application/json": { schema: { type: "string" } } },
          },
        },
      },
    },
  },
};
const controls = {
  port: 0,
  startServer: false,
  startRepl: false,
  buildCache: false,
  watch: { types: false, routes: false },
};

it.each([false, true])(
  "enables initially disabled generation at startup (transform=%s)",
  async (transform) => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.json", JSON.stringify(spec));
      const callback = jest.fn<SchemaTypeTransform>((_schema, type) => type);
      const api = await counterfact({
        ...controls,
        basePath: $.path("api"),
        openApiPath: $.path("openapi.json"),
        generate: { types: false, routes: false },
        ...(transform ? { schemaTypeTransform: callback } : {}),
      });
      let stop = async () => {};
      try {
        ({ stop } = await api.start({ generate: { types: true } }));
        expect(await $.read("api/types/index.ts")).toContain('"/items"');
        await expect($.read("api/routes/items.ts")).rejects.toMatchObject({
          code: "ENOENT",
        });
        expect(callback.mock.calls.length > 0).toBe(transform);
      } finally {
        await stop();
      }
    });
  },
);

it("disables route generation at startup while retaining types and the callback", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("openapi.json", JSON.stringify(spec));
    const callback = jest.fn<SchemaTypeTransform>((_schema, type) => type);
    const api = await counterfact({
      ...controls,
      basePath: $.path("api"),
      openApiPath: $.path("openapi.json"),
      generate: { types: true, routes: true },
      schemaTypeTransform: callback,
    });
    let stop = async () => {};
    try {
      ({ stop } = await api.start({ generate: { routes: false } }));
      expect(await $.read("api/types/index.ts")).toContain('"/items"');
      await expect($.read("api/routes/items.ts")).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(callback).toHaveBeenCalled();
    } finally {
      await stop();
    }
  });
});

it("reports listener status without cloning the transform callback", async () => {
  await usingTemporaryFiles(async ($) => {
    const api = await counterfact({
      ...controls,
      basePath: $.path("api"),
      generate: { types: false, routes: false },
      schemaTypeTransform: (_schema, type) => type,
    });
    let stop = async () => {};
    try {
      expect(api.status()).not.toHaveProperty("schemaTypeTransform");
      ({ stop } = await api.start({ startServer: true }));
      const snapshot = api.status();
      expect(snapshot.listening).toBe(true);
      expect(snapshot.address?.port).toBeGreaterThan(0);
      expect(snapshot).not.toHaveProperty("schemaTypeTransform");
      snapshot.generate.types = true;
      expect(api.status().generate.types).toBe(false);
    } finally {
      await stop();
    }
  });
});
