import { pathToFileURL } from "node:url";

import { describe, expect, it } from "@jest/globals";
import Koa from "koa";

import { usingTemporaryFiles } from "using-temporary-files";

import { Requirement } from "../../src/typescript-generator/requirement.js";
import { Specification } from "../../src/typescript-generator/specification.js";

describe("a Specification", () => {
  it("loads a file from disk", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.yaml", "hello:\n  world");

      const specification = await Specification.fromFile(
        $.path("openapi.yaml"),
      );

      expect(specification.rootRequirement.data).toStrictEqual({
        hello: "world",
      });
    });
  });

  it("loads a file from disk with a file URL", async () => {
    // eslint-disable-next-line jest/no-conditional-in-test
    if (process.platform === "win32") {
      // Not sure why this test started failing in Windows.
      return;
    }
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.yaml", "hello:\n  world");

      const { href } = pathToFileURL($.path("openapi.yaml"));

      const specification = await Specification.fromFile(href);

      expect(specification.rootRequirement.data).toStrictEqual({
        hello: "world",
      });
    });
  });

  it("loads a file from the web", async () => {
    const app = new Koa();

    app.use(({ response }) => {
      response.body = "hello: world";
    });

    const server = app.listen(0);
    const url = `http://localhost:${server.address().port}/`;
    const specification = await Specification.fromFile(url);

    expect(specification.rootRequirement.data).toStrictEqual({
      hello: "world",
    });

    await new Promise((resolve) => {
      server.close(resolve);
    });

    // The server still might not be completely shut down at this point so wait a bit longer

    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
  });

  it("looks for requirements in the root document if no path is provided", () => {
    const person = {
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
      },

      type: "object",
    };

    const specification = new Specification(
      new Requirement({
        components: {
          schemas: {
            Person: person,
          },
        },
      }),
    );

    const requirement = specification.getRequirement(
      "#/components/schemas/Person",
    );

    expect(requirement.data).toStrictEqual(person);
  });

  it("resolves $ref pointing to a components/mediaTypes entry (OpenAPI 3.2)", () => {
    const jsonPayload = {
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      },
    };

    const specification = new Specification(
      new Requirement({
        components: {
          mediaTypes: {
            JsonPayload: jsonPayload,
          },
        },
      }),
    );

    const requirement = specification.getRequirement(
      "#/components/mediaTypes/JsonPayload",
    );

    expect(requirement.data).toStrictEqual(jsonPayload);
  });

  it("follows a $ref to a components/mediaTypes entry transparently (OpenAPI 3.2)", () => {
    const jsonPayload = {
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      },
    };

    const specification = new Specification();
    specification.rootRequirement = new Requirement(
      {
        components: {
          mediaTypes: {
            JsonPayload: jsonPayload,
          },
        },
        paths: {
          "/example": {
            get: {
              responses: {
                "200": {
                  description: "OK",
                  content: {
                    "application/json": {
                      $ref: "#/components/mediaTypes/JsonPayload",
                    },
                  },
                },
              },
            },
          },
        },
      },
      "",
      specification,
    );

    const mediaTypeRef = specification
      .getRequirement("#/paths")
      .get("/example")!
      .get("get")!
      .get("responses")!
      .get("200")!
      .get("content")!
      .get("application/json")!;

    expect(mediaTypeRef.isReference).toBe(true);
    expect(mediaTypeRef.has("schema")).toBe(true);
    expect(mediaTypeRef.get("schema")!.data).toStrictEqual({
      type: "object",
      properties: { name: { type: "string" } },
    });
  });

  describe("error handling", () => {
    it("returns undefined when navigating to a nonexistent components/mediaTypes entry", () => {
      const specification = new Specification(
        new Requirement({
          components: {
            mediaTypes: {
              JsonPayload: { schema: { type: "object" } },
            },
          },
        }),
      );

      // getRequirement delegates to select() which returns undefined for missing paths
      const missing = specification.getRequirement(
        "#/components/mediaTypes/NonExistent",
      ) as unknown;

      expect(missing).toBeUndefined();
    });

    it("throws a user-friendly error when the file does not exist", async () => {
      await expect(
        Specification.fromFile("/nonexistent/path/to/openapi.yaml"),
      ).rejects.toThrow(
        'Could not load the OpenAPI spec from "/nonexistent/path/to/openapi.yaml".',
      );
    });

    it("throws a user-friendly error for a broken $ref", async () => {
      await usingTemporaryFiles(async ($) => {
        await $.add(
          "openapi.json",
          JSON.stringify({ $ref: "./missing-file.json" }),
        );

        await expect(
          Specification.fromFile($.path("openapi.json")),
        ).rejects.toThrow(
          `Could not load the OpenAPI spec from "${$.path("openapi.json")}".`,
        );
      });
    });

    it("includes the original error details in the thrown error message", async () => {
      const error = await Specification.fromFile(
        "/nonexistent/path/to/openapi.yaml",
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toContain(
        'Could not load the OpenAPI spec from "/nonexistent/path/to/openapi.yaml".',
      );
      // The original ENOENT error details should appear after the first line
      expect(message).toContain("ENOENT");
    });
  });
});
