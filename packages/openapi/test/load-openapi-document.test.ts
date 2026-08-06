import { createServer } from "node:http";

import { describe, expect, it } from "@jest/globals";
import { usingTemporaryFiles } from "using-temporary-files";

import {
  bundleOpenApiDocument,
  loadOpenApiDocument,
} from "@counterfact/openapi";

describe("OpenAPI document loading", () => {
  it("loads a local document and dereferences a relative file", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "schemas.yaml",
        [
          "Pet:",
          "  type: object",
          "  properties:",
          "    name:",
          "      type: string",
        ].join("\n"),
      );
      await $.add(
        "openapi.yaml",
        [
          "openapi: 3.0.3",
          "info: { title: Pets, version: 1.0.0 }",
          "paths: {}",
          "components:",
          "  schemas:",
          "    Pet:",
          "      $ref: ./schemas.yaml#/Pet",
        ].join("\n"),
      );

      const document = await loadOpenApiDocument($.path("openapi.yaml"));
      const pet = (
        document.components as {
          schemas: { Pet: { properties: { name: { type: string } } } };
        }
      ).schemas.Pet;

      expect(pet.properties.name.type).toBe("string");
    });
  });

  it("loads a remote document", async () => {
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "application/yaml");
      response.end(
        "openapi: 3.0.3\ninfo: { title: Remote, version: 1.0.0 }\npaths: {}\n",
      );
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("The test server did not expose a TCP port.");
      }

      const document = await bundleOpenApiDocument(
        `http://127.0.0.1:${address.port}/openapi.yaml`,
      );

      expect((document.info as { title: string }).title).toBe("Remote");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("applies overlays in argument order", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.yaml",
        "openapi: 3.0.3\ninfo: { title: Original, version: 1.0.0 }\npaths: {}\n",
      );
      await $.add(
        "first.yaml",
        [
          "overlay: 1.0.0",
          "actions:",
          "  - target: $.info",
          "    update: { title: First, description: Retained }",
        ].join("\n"),
      );
      await $.add(
        "second.yaml",
        [
          "overlay: 1.0.0",
          "actions:",
          "  - target: $.info",
          "    update: { title: Second }",
        ].join("\n"),
      );

      const document = await loadOpenApiDocument($.path("openapi.yaml"), [
        $.path("first.yaml"),
        $.path("second.yaml"),
      ]);

      expect(document.info).toMatchObject({
        description: "Retained",
        title: "Second",
      });
    });
  });

  it("wraps malformed input with source context and preserves the cause", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("broken.yaml", "openapi: [");
      const source = $.path("broken.yaml");

      await expect(loadOpenApiDocument(source)).rejects.toMatchObject({
        cause: expect.anything(),
        message: expect.stringContaining(
          `Could not load the OpenAPI spec from "${source}".`,
        ),
      });
    });
  });
});
