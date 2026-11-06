import { execFile } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";

import { ensureSymlink } from "fs-extra";

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

      expect(normalize(await $.read("dist/found.cjs"))).toBe(
        normalize(JAVASCRIPT_SOURCE_COMMONJS),
      );

      await transpiler.stopWatching();
    });
  });

  it("publishes complete shared cache files from concurrent versioned runners", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("catalog/routes/_.context.ts", TYPESCRIPT_SOURCE);
      await $.add("catalog/.cache/_.context.cjs", "exports.stale = true;");
      const compilers = Array.from(
        { length: 2 },
        () =>
          new Transpiler(
            $.path("catalog/routes"),
            $.path("catalog/.cache"),
            "commonjs",
          ),
      );
      try {
        await Promise.all(
          compilers.map(async (compiler) => {
            await compiler.watch();
            expect(
              normalize(await $.read("catalog/.cache/_.context.cjs")),
            ).toBe(normalize(JAVASCRIPT_SOURCE_COMMONJS));
          }),
        );
      } finally {
        await Promise.all(compilers.map((compiler) => compiler.stopWatching()));
      }
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

      const contents = await $.read("dist/importer.cjs");

      expect(contents.includes('require("./local.cjs")')).toBe(true);

      await transpiler.stopWatching();
    });
  });
});

it.each([
  ["commonjs", "cjs", "cjs"],
  ["commonjs", "cts", "cjs"],
  ["commonjs", "js", "cjs"],
  ["module", "cts", "cjs"],
  ["module", "mts", "mjs"],
])("caches %s .%s sources under .%s filenames", async (kind, input, output) => {
  await usingTemporaryFiles(async ($) => {
    const source =
      input === "cjs" ? "exports.value=7;" : "export const value=7;";
    await $.add(`src.ts-files/probe.${input}`, source);
    const compiler = new Transpiler(
      $.path("src.ts-files"),
      $.path("cache"),
      kind,
    );
    try {
      await compiler.watch();
      expect(await $.read(`cache/probe.${output}`)).toContain("7");
      const removed = once(compiler, "delete");
      await $.remove(`src.ts-files/probe.${input}`);
      await removed;
      await expect($.read(`cache/probe.${output}`)).rejects.toThrow(/ENOENT/u);
    } finally {
      await compiler.stopWatching();
    }
  });
});

it("compiles dotted extensionless dependencies without rewriting non-code assets", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "src/route.ts",
      'import { value } from "./my.helper"; export { value }; const data = require("./data.json");',
    );
    await $.add("src/my.helper.ts", "export const value = 42;");
    await $.add("src/data.json", "{}");
    await $.add("src/data.json.ts", "export const unrelated = true;");
    const compiler = new Transpiler($.path("src"), $.path("cache"), "commonjs");
    try {
      await compiler.watch();
      const route = await $.read("cache/route.cjs");
      expect(route).toContain('require("./my.helper.cjs")');
      expect(route).toContain('require("./data.json")');
      expect(await $.read("cache/my.helper.cjs")).toContain("42");
      await $.add("cache/data.json", "{}");
      const { stdout } = await promisify(execFile)(process.execPath, [
        "-e",
        "console.log(require(process.argv[1]).value)",
        $.path("cache/route.cjs"),
      ]);
      expect(stdout.trim()).toBe("42");
    } finally {
      await compiler.stopWatching();
    }
  });
});

it("compiles symlinked helper directories before watch resolves", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("src/route.ts", 'export { value } from "./linked/helper.js";');
    await $.add("shared/helper.ts", "export const value = 42;");
    // Directory junctions also work without Windows symlink privileges.
    await ensureSymlink($.path("shared"), $.path("src/linked"), "junction");
    const compiler = new Transpiler($.path("src"), $.path("cache"), "commonjs");
    try {
      await compiler.watch();
      expect(await $.read("cache/linked/helper.cjs")).toContain("42");
      expect(await $.read("cache/route.cjs")).toContain(
        'require("./linked/helper.cjs")',
      );
      const { stdout } = await promisify(execFile)(process.execPath, [
        "-e",
        "console.log(require(process.argv[1]).value)",
        $.path("cache/route.cjs"),
      ]);
      expect(stdout.trim()).toBe("42");
    } finally {
      await compiler.stopWatching();
    }
  });
});
