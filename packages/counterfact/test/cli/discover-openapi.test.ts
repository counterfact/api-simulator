import { describe, expect, it } from "@jest/globals";
import { usingTemporaryFiles } from "using-temporary-files";

import {
  discoverOpenApiSpecs,
  isSupportedOpenApiDocument,
} from "../../src/cli/discover-openapi.js";

const document = {
  openapi: "3.0.3",
  info: { title: "Local API", version: "1.0.0" },
  paths: {},
};

describe("isSupportedOpenApiDocument", () => {
  it.each(["3.0.0", "3.1.1", "3.2.0"])("recognizes OpenAPI %s", (openapi) => {
    expect(isSupportedOpenApiDocument({ ...document, openapi })).toBe(true);
  });

  it("recognizes Swagger 2.0", () => {
    expect(
      isSupportedOpenApiDocument({
        swagger: "2.0",
        info: document.info,
        paths: {},
      }),
    ).toBe(true);
  });

  it("recognizes OpenAPI 3.1 component-only documents", () => {
    expect(
      isSupportedOpenApiDocument({
        openapi: "3.1.0",
        info: document.info,
        components: {},
      }),
    ).toBe(true);
  });

  it("recognizes OpenAPI 3.2 webhook-only documents", () => {
    expect(
      isSupportedOpenApiDocument({
        openapi: "3.2.0",
        info: document.info,
        webhooks: {},
      }),
    ).toBe(true);
  });

  it.each([
    null,
    [],
    "openapi: 3.0.3",
    { ...document, info: null },
    { ...document, info: { title: "API" } },
    { ...document, info: { title: 1, version: "1" } },
    { ...document, paths: [] },
    { ...document, openapi: "3.3.0" },
    { ...document, openapi: "4.0.0" },
    { ...document, openapi: 3 },
    { ...document, openapi: undefined },
    { swagger: "1.2", info: document.info, paths: {} },
    { openapi: "3.0.3", info: document.info, components: {} },
  ])("rejects unsupported documents: %p", (value) => {
    expect(isSupportedOpenApiDocument(value)).toBe(false);
  });
});

describe("discoverOpenApiSpecs", () => {
  it("finds JSON and YAML documents recursively, independent of filenames", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("api.JSON", JSON.stringify(document));
      await $.add(
        "nested/contracts/service.yml",
        "openapi: 3.2.0\ninfo:\n  title: API\n  version: '1'\npaths: {}\n",
      );
      await $.add(
        "nested/swagger.yaml",
        "swagger: '2.0'\ninfo:\n  title: Legacy\n  version: '1'\npaths: {}\n",
      );

      const result = await discoverOpenApiSpecs($.path("."));
      expect(result.specs.map((path) => path.replaceAll("\\", "/"))).toEqual([
        "api.JSON",
        "nested/contracts/service.yml",
        "nested/swagger.yaml",
      ]);
      expect(result.limited).toBe(false);
      expect(result.unreadable).toBe(false);
    });
  });

  it("ignores malformed files, ordinary config, fragments, and unsupported versions", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("broken.yaml", "openapi: [");
      await $.add(
        "broken.json",
        "openapi: 3.0.3\ninfo: {title: API, version: '1'}\npaths: {}",
      );
      await $.add("counterfact.yaml", "port: 3100");
      await $.add("package.json", '{"name":"project"}');
      await $.add("fragment.yaml", "type: object\nproperties: {}");
      await $.add(
        "future.json",
        JSON.stringify({ ...document, openapi: "4.0.0" }),
      );
      expect((await discoverOpenApiSpecs($.path("."))).specs).toEqual([]);
    });
  });

  it("skips hidden, dependency, and build directories", async () => {
    await usingTemporaryFiles(async ($) => {
      for (const directory of [
        "node_modules",
        "vendor",
        "dist",
        "build",
        "out",
        "coverage",
        "target",
        "bower_components",
        ".git",
        ".cache",
        "__pycache__",
      ]) {
        await $.add(`${directory}/api.json`, JSON.stringify(document));
      }
      await $.add(".hidden.json", JSON.stringify(document));
      expect((await discoverOpenApiSpecs($.path("."))).specs).toEqual([]);
    });
  });

  it("recognizes a document without resolving its external references", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "references.json",
        JSON.stringify({
          ...document,
          paths: {
            "/hello": { $ref: "https://invalid.example/nonexistent.yaml" },
          },
        }),
      );
      expect((await discoverOpenApiSpecs($.path("."))).specs).toEqual([
        "references.json",
      ]);
    });
  });

  it("bounds the directory depth and document size", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(`${"nested/".repeat(9)}api.json`, JSON.stringify(document));
      await $.add("huge.yaml", `#${" ".repeat(2 * 1024 * 1024)}\n`);
      const result = await discoverOpenApiSpecs($.path("."));
      expect(result.specs).toEqual([]);
      expect(result.limited).toBe(true);
    });
  });

  it("caps the number of selectable specs", async () => {
    await usingTemporaryFiles(async ($) => {
      await Promise.all(
        Array.from({ length: 101 }, (_, index) =>
          $.add(`api-${index}.json`, JSON.stringify(document)),
        ),
      );
      const result = await discoverOpenApiSpecs($.path("."));
      expect(result.specs).toHaveLength(100);
      expect(result.limited).toBe(true);
    });
  });

  it("does not report truncation when exactly 100 specs exhaust the search", async () => {
    await usingTemporaryFiles(async ($) => {
      await Promise.all(
        Array.from({ length: 100 }, (_, index) =>
          $.add(`api-${index}.json`, JSON.stringify(document)),
        ),
      );
      const result = await discoverOpenApiSpecs($.path("."));
      expect(result.specs).toHaveLength(100);
      expect(result.limited).toBe(false);
    });
  });

  it("reports an unreadable root without failing the intro", async () => {
    await usingTemporaryFiles(async ($) => {
      expect(await discoverOpenApiSpecs($.path("missing"))).toEqual({
        specs: [],
        limited: false,
        unreadable: true,
      });
    });
  });

  it("stops when cancelled", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("api.json", JSON.stringify(document));
      expect(
        (await discoverOpenApiSpecs($.path("."), AbortSignal.abort())).specs,
      ).toEqual([]);
    });
  });
});
