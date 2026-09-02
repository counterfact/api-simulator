import nodePath from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "@jest/globals";
import { usingTemporaryFiles } from "using-temporary-files";

import {
  classifyOpenApiSource,
  getLocalOpenApiSourcePaths,
} from "../src/index.js";

describe("OpenAPI source classification", () => {
  it("classifies parsed HTTP(S) URLs as remote", () => {
    expect(
      classifyOpenApiSource("http://example.com/openapi.yaml"),
    ).toMatchObject({ kind: "remote" });
    expect(
      classifyOpenApiSource("https://example.com/openapi.yaml"),
    ).toMatchObject({ kind: "remote" });
  });

  it("classifies ordinary paths beginning with URL scheme names as local", async () => {
    await usingTemporaryFiles(async ($) => {
      const originalWorkingDirectory = process.cwd();
      process.chdir($.path("."));

      try {
        expect(classifyOpenApiSource("httpspec.yaml")).toStrictEqual({
          kind: "local",
          path: nodePath.resolve("httpspec.yaml"),
        });
      } finally {
        process.chdir(originalWorkingDirectory);
      }
    });
  });

  it("converts file URLs to local paths", async () => {
    await usingTemporaryFiles(async ($) => {
      const path = $.path("openapi.yaml");

      expect(classifyOpenApiSource(pathToFileURL(path).href)).toStrictEqual({
        kind: "local",
        path,
      });
    });
  });

  it("returns unique local contributing inputs and preserves '_'", async () => {
    await usingTemporaryFiles(async ($) => {
      const path = $.path("overlay.yaml");

      expect(
        getLocalOpenApiSourcePaths([
          "_",
          "https://example.com/openapi.yaml",
          path,
          pathToFileURL(path).href,
        ]),
      ).toStrictEqual([path]);
    });
  });

  it("rejects NUL bytes", () => {
    expect(() => classifyOpenApiSource("bad\0path.yaml")).toThrow(
      "File path cannot contain NUL bytes.",
    );
  });
});
