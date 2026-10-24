import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { usingTemporaryFiles } from "using-temporary-files";

const buildScript = fileURLToPath(new URL("./build.mjs", import.meta.url));

for (const exitCode of [0, 7]) {
  test(`uses the Yarn command when npm_execpath is a shell wrapper (exit ${exitCode})`, () =>
    usingTemporaryFiles(async ($) => {
      const windows = process.platform === "win32";
      await $.add("wrapper", "#!/bin/sh\nexit 99\n");
      const shim = windows ? "yarn.cmd" : "yarn";
      await $.add(
        shim,
        windows
          ? `@echo off\r\necho yarn fixture reached\r\nexit /b ${exitCode}\r\n`
          : `#!/bin/sh\necho 'yarn fixture reached'\nexit ${exitCode}\n`,
      );
      if (!windows) execFileSync("chmod", ["+x", $.path(shim)]);
      const result = spawnSync(process.execPath, [buildScript], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${$.path(".")}${path.delimiter}${process.env["PATH"] ?? ""}`,
          npm_execpath: $.path("wrapper"),
        },
      });
      assert.equal(result.status, exitCode, result.stderr);
      assert.match(result.stdout, /yarn fixture reached/u);
      if (exitCode === 0) {
        assert.match(result.stdout, /Build complete/u);
      } else {
        assert.match(result.stderr, /Generator.+failed/u);
        assert.doesNotMatch(result.stdout, /Building Runtime|Build complete/u);
      }
    }));
}
