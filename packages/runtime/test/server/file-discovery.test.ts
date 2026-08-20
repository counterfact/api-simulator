import nodePath from "node:path";

import { usingTemporaryFiles } from "using-temporary-files";

import { FileDiscovery } from "../../src/server/file-discovery.js";

describe("FileDiscovery", () => {
  it("finds JS files in a flat directory", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("a.js", "");
      await $.add("b.mjs", "");

      const discovery = new FileDiscovery($.path("."));
      const files = await discovery.findFiles();

      expect(files.map((f) => nodePath.basename(f))).toEqual(
        expect.arrayContaining(["a.js", "b.mjs"]),
      );
      expect(files).toHaveLength(2);
    });
  });

  it("finds TS files", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("handler.ts", "");
      await $.add("handler.mts", "");
      await $.add("handler.cts", "");
      await $.add("handler.cjs", "");

      const discovery = new FileDiscovery($.path("."));
      const files = await discovery.findFiles();

      expect(files).toHaveLength(4);
    });
  });

  it("ignores non-JS/TS files", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("README.md", "");
      await $.add("data.json", "");
      await $.add("module.js", "");

      const discovery = new FileDiscovery($.path("."));
      const files = await discovery.findFiles();

      expect(files).toHaveLength(1);
      expect(files[0]).toContain("module.js");
    });
  });

  it("recursively finds files in subdirectories", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("root.js", "");
      await $.add("sub/child.js", "");
      await $.add("sub/deep/leaf.js", "");

      const discovery = new FileDiscovery($.path("."));
      const files = await discovery.findFiles();

      expect(files).toHaveLength(3);
    });
  });

  it("throws when the directory does not exist", async () => {
    const discovery = new FileDiscovery("/nonexistent/path");

    await expect(discovery.findFiles()).rejects.toThrow(
      "Directory does not exist",
    );
  });

  it("returns an empty array for an empty directory", async () => {
    await usingTemporaryFiles(async ($) => {
      const discovery = new FileDiscovery($.path("."));
      const files = await discovery.findFiles();

      expect(files).toEqual([]);
    });
  });
});
