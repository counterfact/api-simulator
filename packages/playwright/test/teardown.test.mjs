import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

import { usingTemporaryFiles } from "using-temporary-files";

const require = createRequire(import.meta.url);
const packageEntry = import.meta.resolve("@counterfact/playwright");
const playwright = require.resolve("@playwright/test/cli");

async function run(args) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [playwright, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
}

for (const failure of ["none", "test", "scenario", "reset", "startup"]) {
  test(`removes worker files and closes HTTP after ${failure}`, () =>
    usingTemporaryFiles(async ($) => {
      await $.add("package.json", JSON.stringify({ type: "module" }));
      await $.add(
        "api/routes/ready.ts",
        'export const GET = () => ({ status: 200, body: "ready" });',
      );
      await $.add(
        "api/scenarios/index.ts",
        `
import { fileURLToPath } from "node:url";
let starts = 0;
export function startup() {
  starts += 1;
  ${failure === "startup" ? 'throw new Error("startup failure: " + fileURLToPath(import.meta.url));' : ""}
  ${failure === "reset" ? 'if (starts > 1) throw new Error("reset failure");' : ""}
}
`,
      );
      await $.add(
        "fixture.spec.ts",
        `
import { createCounterfactTest, expect } from ${JSON.stringify(packageEntry)};
const base = createCounterfactTest({ basePath: ${JSON.stringify($.path("api"))} });
const test = base.extend({
  audit: [async ({ workerSimulator, simulatorURL }, use) => {
    console.log("RESOURCE " + JSON.stringify({ basePath: workerSimulator.status().basePath, url: simulatorURL }));
    await use();
  }, { scope: "worker", auto: true }],
});
${failure === "scenario" ? 'test.use({ scenarioName: "missingScenario" });' : ""}
test("consumer", async ({ request, simulatorURL }) => {
  expect((await request.get(simulatorURL + "/ready")).status()).toBe(200);
  ${failure === "test" ? 'throw new Error("test failure");' : ""}
});
`,
      );
      await $.add(
        "playwright.config.ts",
        `
export default { testDir: ".", workers: 1, retries: 0, reporter: "line", outputDir: "./results" };
`,
      );
      const result = await run([
        "test",
        "--config",
        $.path("playwright.config.ts"),
      ]);
      assert.equal(result.code, failure === "none" ? 0 : 1, result.output);
      if (failure === "startup") {
        assert.match(result.output, /startup failure/u);
        const match = result.output.match(
          /startup failure: (.+[\\/]api)[\\/]scenarios[\\/]/u,
        );
        assert(match, result.output);
        await assert.rejects(
          $.read(
            path.relative(
              $.path("."),
              path.join(match[1], "scenarios/index.ts"),
            ),
          ),
          { code: "ENOENT" },
        );
      } else {
        const match = result.output.match(/RESOURCE (\{[^\r\n]+\})/u);
        assert(match, result.output);
        const resource = JSON.parse(match[1]);
        await assert.rejects(
          $.read(
            path.relative(
              $.path("."),
              path.join(resource.basePath, "routes/ready.ts"),
            ),
          ),
          { code: "ENOENT" },
        );
        await assert.rejects(fetch(resource.url));
        if (failure !== "none")
          assert.match(
            result.output,
            new RegExp(
              failure === "scenario" ? "missingScenario" : `${failure} failure`,
              "u",
            ),
          );
      }
    }));
}

test("parallel workers isolate listeners, copied sources and compiled caches", () =>
  usingTemporaryFiles(async ($) => {
    await $.add("package.json", JSON.stringify({ type: "module" }));
    await $.add(
      "api/routes/_.context.ts",
      'export class Context { marker = "baseline"; }',
    );
    await $.add(
      "api/routes/ready.ts",
      "export const GET = ({ context }) => ({ status: 200, body: context.marker });",
    );
    await $.add(
      "api/.cache/ghost.cjs",
      'exports.GET = () => ({ status: 200, body: "stale" });',
    );
    await $.add(
      "fixtures.ts",
      `
import { createCounterfactTest, expect } from ${JSON.stringify(packageEntry)};
export const test = createCounterfactTest({ basePath: ${JSON.stringify($.path("api"))} });
export { expect };
`,
    );
    for (const name of ["alpha", "beta"]) {
      await $.add(
        `${name}.spec.ts`,
        `
import { test, expect } from "./fixtures.js";
test("${name}", async ({ simulator, simulatorURL, request }, info) => {
  console.log("RESOURCE " + JSON.stringify({ basePath: simulator.status().basePath, url: simulatorURL, worker: info.workerIndex }));
  const context = simulator.loadContext("/");
  expect(context.marker).toBe("baseline");
  context.marker = ${JSON.stringify(name)};
  expect((await request.get(simulatorURL + "/ghost")).status()).toBe(404);
  await new Promise(resolve => setTimeout(resolve, 200));
  expect(await (await request.get(simulatorURL + "/ready")).text()).toBe(${JSON.stringify(name)});
});
`,
      );
    }
    await $.add(
      "playwright.config.ts",
      'export default { testDir: ".", workers: 2, reporter: "line", outputDir: "./results" };',
    );
    const result = await run([
      "test",
      "--config",
      $.path("playwright.config.ts"),
    ]);
    assert.equal(result.code, 0, result.output);
    const resources = [
      ...result.output.matchAll(/RESOURCE (\{[^\r\n]+\})/gu),
    ].map((match) => JSON.parse(match[1]));
    assert.equal(resources.length, 2, result.output);
    for (const key of ["basePath", "url", "worker"]) {
      assert.equal(
        new Set(resources.map((resource) => resource[key])).size,
        2,
        key,
      );
    }
    for (const resource of resources) {
      await assert.rejects(
        $.read(
          path.relative(
            $.path("."),
            path.join(resource.basePath, "routes/ready.ts"),
          ),
        ),
        { code: "ENOENT" },
      );
      await assert.rejects(fetch(resource.url));
    }
    assert.equal(
      await $.read("api/.cache/ghost.cjs"),
      'exports.GET = () => ({ status: 200, body: "stale" });',
    );
  }));

for (const scope of ["inherited", "nested-commonjs", "nested-default"]) {
  test(`preserves dependency lookup and ${scope} JavaScript scenario scope`, () =>
    usingTemporaryFiles(async ($) => {
      await $.add("package.json", JSON.stringify({ type: "module" }));
      for (const [directory, name, value] of [
        ["node_modules", "hoisted-value", "hoisted"],
        ["node_modules", "shadowed-value", "root"],
        ["workspace/node_modules", "local-value", "local"],
        ["workspace/node_modules", "shadowed-value", "nearest"],
        ["workspace/api/node_modules", "api-value", "api"],
      ]) {
        await $.add(
          `${directory}/${name}/package.json`,
          JSON.stringify({ name, main: "index.js" }),
        );
        await $.add(
          `${directory}/${name}/index.js`,
          `module.exports = ${JSON.stringify(value)};`,
        );
      }
      await $.add(
        "workspace/api/routes/ready.ts",
        `
import local from "local-value";
import hoisted from "hoisted-value";
import shadowed from "shadowed-value";
import api from "api-value";
export const GET = () => ({ status: 200, body: { local, hoisted, shadowed, api } });
`,
      );
      await $.add(
        "workspace/api/routes/_.context.ts",
        'export class Context { marker = "baseline"; }',
      );
      if (scope !== "inherited") {
        await $.add(
          "workspace/api/scenarios/package.json",
          JSON.stringify(
            scope === "nested-commonjs" ? { type: "commonjs" } : {},
          ),
        );
      }
      await $.add(
        "workspace/api/scenarios/index.js",
        scope === "inherited"
          ? `
import hoisted from "hoisted-value";
await Promise.resolve();
export function startup({ context }) { context.marker = hoisted; }
export function selected({ context }) { context.marker = "selected"; }
`
          : `
const local = require("local-value");
exports.startup = ({ context }) => { context.marker = local; };
exports.selected = ({ context }) => { context.marker = "selected"; };
`,
      );
      await $.add(
        "fixture.spec.ts",
        `
import { createCounterfactTest, expect } from ${JSON.stringify(packageEntry)};
const test = createCounterfactTest({ basePath: ${JSON.stringify($.path("workspace/api"))} });
test("startup and dependencies", async ({ simulator, request, simulatorURL }) => {
  expect(simulator.loadContext("/").marker).toBe(${JSON.stringify(scope === "inherited" ? "hoisted" : "local")});
  expect(await (await request.get(simulatorURL + "/ready")).json()).toEqual({ local: "local", hoisted: "hoisted", shadowed: "nearest", api: "api" });
});
test.describe("named scenario", () => {
  test.use({ scenarioName: "selected" });
  test("loads JavaScript scenario", async ({ simulator }) => {
    expect(simulator.loadContext("/").marker).toBe("selected");
  });
});
`,
      );
      await $.add(
        "playwright.config.ts",
        'export default { testDir: ".", workers: 1, retries: 0, reporter: "line", outputDir: "./results" };',
      );
      const result = await run([
        "test",
        "--config",
        $.path("playwright.config.ts"),
      ]);
      assert.equal(result.code, 0, result.output);
    }));
}
