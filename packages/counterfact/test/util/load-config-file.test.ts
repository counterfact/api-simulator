import { describe, expect, it } from "@jest/globals";

import { usingTemporaryFiles } from "using-temporary-files";

import { loadConfigFile } from "../../src/util/load-config-file.js";

describe("loadConfigFile", () => {
  it("returns an empty object when the file does not exist (default)", async () => {
    const result = await loadConfigFile("/nonexistent/path/counterfact.yaml");
    expect(result).toEqual({});
  });

  it("throws when the file does not exist and required=true", async () => {
    await expect(
      loadConfigFile("/nonexistent/path/counterfact.yaml", true),
    ).rejects.toThrow("Config file not found");
  });

  it("throws when config path contains NUL bytes", async () => {
    await expect(loadConfigFile("counterfact\0.yaml", true)).rejects.toThrow(
      "File path cannot contain NUL bytes.",
    );
  });

  it("returns an empty object for an empty file", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("counterfact.yaml", "");
      const result = await loadConfigFile($.path("counterfact.yaml"));
      expect(result).toEqual({});
    });
  });

  it("parses simple key/value pairs", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("counterfact.yaml", "port: 4000\nserve: true\n");
      const result = await loadConfigFile($.path("counterfact.yaml"));
      expect(result).toEqual({ port: 4000, serve: true });
    });
  });

  it("normalizes kebab-case keys to camelCase", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "counterfact.yaml",
        "proxy-url: https://example.com\nalways-fake-optionals: true\n",
      );
      const result = await loadConfigFile($.path("counterfact.yaml"));
      expect(result).toEqual({
        proxyUrl: "https://example.com",
        alwaysFakeOptionals: true,
      });
    });
  });

  it("leaves camelCase keys unchanged", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "counterfact.yaml",
        "proxyUrl: https://example.com\nprefix: /api/v1\n",
      );
      const result = await loadConfigFile($.path("counterfact.yaml"));
      expect(result).toEqual({
        proxyUrl: "https://example.com",
        prefix: "/api/v1",
      });
    });
  });

  it("throws when the config file is a YAML list (not a mapping)", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("counterfact.yaml", "- item1\n- item2\n");
      await expect(loadConfigFile($.path("counterfact.yaml"))).rejects.toThrow(
        "Config file must be a YAML object",
      );
    });
  });

  it("throws when the config file is a scalar (not a mapping)", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("counterfact.yaml", "just a string\n");
      await expect(loadConfigFile($.path("counterfact.yaml"))).rejects.toThrow(
        "Config file must be a YAML object",
      );
    });
  });

  it("parses a realistic counterfact.yaml config", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "counterfact.yaml",
        [
          "spec: ./openapi.yaml",
          "port: 8080",
          "serve: true",
          "repl: true",
          "watch: true",
          "proxy-url: https://api.example.com",
          "prefix: /api/v1",
          "always-fake-optionals: false",
        ].join("\n"),
      );
      const result = await loadConfigFile($.path("counterfact.yaml"));
      expect(result).toEqual({
        spec: "./openapi.yaml",
        port: 8080,
        serve: true,
        repl: true,
        watch: true,
        proxyUrl: "https://api.example.com",
        prefix: "/api/v1",
        alwaysFakeOptionals: false,
      });
    });
  });
});
