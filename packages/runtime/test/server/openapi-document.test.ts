import { usingTemporaryFiles } from "using-temporary-files";

import { OpenApiDocument } from "../../src/server/openapi-document.js";
import { waitForEvent } from "../../src/util/wait-for-event.js";

const OPENAPI = {
  openapi: "3.0.3",
  components: {
    securitySchemes: {
      apiKeyAuth: {
        in: "header",
        name: "api_key",
        type: "apiKey",
      },
    },
  },
  info: { title: "Test", version: "1.0.0" },
  paths: {
    "/example": {
      get: {
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};

describe("OpenApiDocument", () => {
  if (process.platform === "win32") {
    it("skips these tests because Windows", () => {
      expect("windows-is-dumb").toEqual("windows-is-dumb");
    });

    return;
  }

  it("extends EventTarget", () => {
    const doc = new OpenApiDocument("/fake/path.json");

    expect(doc).toBeInstanceOf(EventTarget);
  });

  it("exposes the source path", () => {
    const doc = new OpenApiDocument("/fake/path.json");

    expect(doc.source).toBe("/fake/path.json");
  });

  it("loads and exposes paths from the source file", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.json", JSON.stringify(OPENAPI));

      const doc = new OpenApiDocument($.path("openapi.json"));

      await doc.load();

      expect(Object.keys(doc.paths)).toContain("/example");
    });
  });

  it("loads and exposes security schemes from the source file", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.json", JSON.stringify(OPENAPI));

      const doc = new OpenApiDocument($.path("openapi.json"));

      await doc.load();

      expect(doc.components?.securitySchemes).toStrictEqual(
        OPENAPI.components.securitySchemes,
      );
    });
  });

  it("throws a descriptive error when the source file does not exist", async () => {
    const doc = new OpenApiDocument("/nonexistent/path.json");

    await expect(doc.load()).rejects.toThrow(
      'Could not load the OpenAPI spec from "/nonexistent/path.json".',
    );
  });

  it("dispatches a reload event when the source file changes", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.json", JSON.stringify(OPENAPI));

      const doc = new OpenApiDocument($.path("openapi.json"));

      await doc.load();
      await doc.watch();

      const changed = {
        ...OPENAPI,
        info: { title: "Updated", version: "2.0.0" },
      };
      await $.add("openapi.json", JSON.stringify(changed));

      await waitForEvent(doc, "reload");

      await doc.stopWatching();

      expect(Object.keys(doc.paths)).toContain("/example");
    });
  });

  it("updates paths after a file change", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.json", JSON.stringify(OPENAPI));

      const doc = new OpenApiDocument($.path("openapi.json"));

      await doc.load();
      await doc.watch();

      const updated = {
        ...OPENAPI,
        paths: {
          "/updated": {
            get: {
              responses: { "200": { description: "OK" } },
            },
          },
        },
      };
      await $.add("openapi.json", JSON.stringify(updated));

      await waitForEvent(doc, "reload");

      await doc.stopWatching();

      expect(Object.keys(doc.paths)).toContain("/updated");
      expect(Object.keys(doc.paths)).not.toContain("/example");
    });
  });

  it("does not watch when source is '_'", async () => {
    const doc = new OpenApiDocument("_");

    await expect(doc.watch()).resolves.toBeUndefined();
    await doc.stopWatching();
  });

  it("does not watch when source is a URL", async () => {
    const doc = new OpenApiDocument("https://example.com/openapi.json");

    await expect(doc.watch()).resolves.toBeUndefined();
    await doc.stopWatching();
  });
});
