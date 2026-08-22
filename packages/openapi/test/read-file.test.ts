import { describe, expect, it } from "@jest/globals";

import { usingTemporaryFiles } from "using-temporary-files";

import { readFile } from "../src/index.js";

describe("readFile", () => {
  it("reads a local file by path", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("test.txt", "hello from file");
      const content = await readFile($.path("test.txt"));
      expect(content).toBe("hello from file");
    });
  });

  it("reads a local file using a file:// URL", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("test.txt", "hello from file url");
      const fileUrl = new URL($.path("test.txt"), "file://").href;
      const content = await readFile(fileUrl);
      expect(content).toBe("hello from file url");
    });
  });

  it("reads relative paths that begin with URL scheme names", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("file-spec.yaml", "local file spec");
      await $.add("httpspec.yaml", "local http spec");
      const originalWorkingDirectory = process.cwd();
      process.chdir($.path("."));

      try {
        await expect(readFile("file-spec.yaml")).resolves.toBe(
          "local file spec",
        );
        await expect(readFile("httpspec.yaml")).resolves.toBe(
          "local http spec",
        );
      } finally {
        process.chdir(originalWorkingDirectory);
      }
    });
  });

  it("rejects local paths containing NUL bytes", async () => {
    await expect(readFile("bad\0path.txt")).rejects.toThrow(
      "File path cannot contain NUL bytes.",
    );
  });
});
