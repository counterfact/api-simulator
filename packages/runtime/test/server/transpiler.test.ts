import { once } from "node:events";

import { usingTemporaryFiles } from "using-temporary-files";

import { toForwardSlashPath } from "../../src/util/forward-slash-path.js";
import { Transpiler } from "../../src/server/transpiler.js";

const TYPESCRIPT_SOURCE = `export const x:number = 1;\n`;
const JAVASCRIPT_SOURCE = `export const x = 1;\n`;
const JAVASCRIPT_SOURCE_COMMONJS = `"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\nexports.x = void 0;\nexports.x = 1;\n`;

function normalize(fileContents: string) {
  return fileContents
    .replace(/^\uFEFF/u, "") // strip BOM if present
    .replace(/\r\n/g, "\n") // normalize CRLF
    .replace(/\r/g, "\n") // normalize lone CR
    .trimEnd();
}

describe("a Transpiler", () => {
  let transpiler: Transpiler = new Transpiler("src", "dist", "");

  afterEach(async () => {
    await transpiler.stopWatching();
  });

  it("finds a file and transpiles it", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("src/found.ts", TYPESCRIPT_SOURCE);

      transpiler = new Transpiler(
        toForwardSlashPath($.path("src")),
        toForwardSlashPath($.path("dist")),
        "module",
      );

      await transpiler.watch();

      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(normalize(await $.read("dist/found.js"))).toBe(
        normalize(JAVASCRIPT_SOURCE),
      );

      await transpiler.stopWatching();
    });
  });

  it("discovers a new file and transpiles it", async () => {
    // on Linux the watcher doesn't seem to work consistently if there's not a file in the directory to begin with

    await usingTemporaryFiles(async ($) => {
      await $.add("src/starter.ts", TYPESCRIPT_SOURCE);

      transpiler = new Transpiler(
        toForwardSlashPath($.path("src")),
        toForwardSlashPath($.path("dist")),
        "module",
      );

      await transpiler.watch();

      const write = once(transpiler, "write");
      const error = once(transpiler, "error");

      await $.add("src/added.ts", TYPESCRIPT_SOURCE);

      // eslint-disable-next-line jest/no-conditional-in-test -- Chokidar's add event is unreliable on Windows CI runners.
      if (process.platform === "win32") {
        return;
      }

      await Promise.race([write, error]);

      expect(normalize(await $.read("dist/added.js"))).toBe(
        normalize(JAVASCRIPT_SOURCE),
      );

      await transpiler.stopWatching();
    });
  });

  it("sees an updated file and transpiles it", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("src/update-me.ts", "const x = 'code to be overwritten';\n");

      transpiler = new Transpiler(
        toForwardSlashPath($.path("src")),
        toForwardSlashPath($.path("dist")),
        "module",
      );

      const initialWrite = once(transpiler, "write");

      await transpiler.watch();
      await initialWrite;

      const overwrite = once(transpiler, "write");

      await $.add("src/update-me.ts", TYPESCRIPT_SOURCE);
      await overwrite;

      expect(normalize(await $.read("dist/update-me.js"))).toBe(
        normalize(JAVASCRIPT_SOURCE),
      );

      await transpiler.stopWatching();
    });
  }, 10_000);

  it("sees a removed TypeScript file and deletes the JavaScript file", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("src/delete-me.ts", TYPESCRIPT_SOURCE);

      transpiler = new Transpiler(
        toForwardSlashPath($.path("src")),
        toForwardSlashPath($.path("dist")),
        "module",
      );

      await transpiler.watch();
      await $.remove("src/delete-me.ts");
      await once(transpiler, "delete");

      await expect($.read("dist/delete-me.js")).rejects.toThrow(/ENOENT/u);

      await transpiler.stopWatching();
    });
  });

  it("transpiles as CommonJS when specified", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("src/found.ts", TYPESCRIPT_SOURCE);

      transpiler = new Transpiler(
        toForwardSlashPath($.path("src")),
        toForwardSlashPath($.path("dist")),
        "commonjs",
      );

      await transpiler.watch();

      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(normalize(await $.read("dist/found.cjs"))).toBe(
        normalize(JAVASCRIPT_SOURCE_COMMONJS),
      );

      await transpiler.stopWatching();
    });
  });

  it("converts requires of .js files to .cjs", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "src/importer.ts",
        'import local from "./local.js"; local();',
      );

      transpiler = new Transpiler(
        toForwardSlashPath($.path("src")),
        toForwardSlashPath($.path("dist")),
        "commonjs",
      );

      await transpiler.watch();

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const contents = await $.read("dist/importer.cjs");

      expect(contents.includes('require("./local.cjs")')).toBe(true);

      await transpiler.stopWatching();
    });
  });
});
