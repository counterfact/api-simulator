import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

const execute = promisify(execFile);
const repository = fileURLToPath(new URL("../", import.meta.url));
const cases = {
  "openapi-typescript": {
    method: "GET",
    path: "/pets/42",
    status: 200,
    expected: { id: "42", name: "Milo", status: "available" },
  },
  "hey-api": {
    spec: "openapi.json",
    method: "GET",
    path: "/pets/1",
    status: 200,
    expected: { id: 1, name: "Buddy", status: "available" },
  },
  orval: {
    method: "POST",
    path: "/pets",
    status: 201,
    body: { id: 1, name: "Milo", owner: { name: "Patrick" } },
  },
  "openapi-generator-fetch": {
    spec: "openapi.json",
    method: "POST",
    path: "/pets",
    status: 200,
    body: {
      id: 42,
      name: "Rover",
      owner: { id: 7, name: "Alex" },
      status: "available",
    },
  },
  "openapi-generator-axios": {
    spec: "openapi.json",
    method: "POST",
    path: "/pets",
    status: 200,
    body: {
      id: 42,
      name: "Rover",
      owner: { id: 7, name: "Alex" },
      status: "available",
    },
  },
  "swagger-typescript-api": {
    destination: "src/simulation",
    method: "GET",
    path: "/pets",
    status: 200,
    expected: [{ id: 1, name: "Ada", status: "available" }],
  },
  "openapi-typescript-codegen": {
    method: "GET",
    path: "/pet",
    status: 200,
    expected: { id: 1, name: "Milo", status: "available" },
  },
  nswag: {
    spec: "openapi.json",
    method: "GET",
    path: "/pets/1",
    status: 200,
    expected: { id: 1, name: "Buddy", status: "available" },
  },
};
const selected = process.argv[2];
if (selected === "--list") {
  console.log(Object.keys(cases).join("\n"));
}
if (selected && selected !== "--list" && !Object.hasOwn(cases, selected))
  throw new Error(`Unknown generator reuse example: ${selected}`);
const packages = [
  "types",
  "openapi",
  "generator",
  "runtime",
  "client",
  "repl",
  "counterfact",
];

async function verify(name, smoke) {
  await usingTemporaryFiles(async ($) => {
    const relative = `examples/generator-reuse/${name}`;
    const artifacts = path.relative(
      $.path("."),
      path.join(repository, "artifacts/generator-reuse", name),
    );
    const report = { name, passed: false, commands: [] };
    let config;
    const run = async (command, args, cwd) => {
      report.commands.push({ command: path.basename(command), args });
      const result = await execute(command, args, {
        cwd,
        maxBuffer: 32 * 1024 * 1024,
        timeout: 300_000,
        env: { ...process.env, CI: "true", NO_COLOR: "1" },
      });
      console.log(result.stdout);
      return result.stdout;
    };
    try {
      const files = (await run("git", ["ls-files", "--", relative], repository))
        .trim()
        .split("\n")
        .filter(Boolean);
      assert.notEqual(
        files.length,
        0,
        `No committed proof-of-concept files for ${name}`,
      );
      for (const file of files) {
        const local = path.relative($.path("."), path.join(repository, file));
        await $.add(
          path.join("project", path.relative(relative, file)),
          await $.read(local),
        );
      }
      await $.addDirectory("tarballs");
      const tarballs = [];
      for (const workspace of packages) {
        const stdout = await run(
          "npm",
          [
            "pack",
            "--ignore-scripts",
            "--json",
            "--pack-destination",
            $.path("tarballs"),
            "--cache",
            $.path("npm-cache"),
          ],
          path.join(repository, "packages", workspace),
        );
        const [{ filename }] = JSON.parse(stdout);
        tarballs.push($.path(path.join("tarballs", filename)));
      }
      // Override only the unreleased Counterfact implementation. The SDK remains
      // ordinary generated source inside this one app, never an npm package.
      await run(
        "npm",
        [
          "install",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          "--no-save",
          "--package-lock=false",
          "--cache",
          $.path("npm-cache"),
          ...tarballs,
        ],
        $.path("project"),
      );
      await run("npm", ["run", "verify"], $.path("project"));
      report.generationAndCompilerPassed = true;
      config = {
        spec: smoke.spec ?? "openapi.yaml",
        destination: smoke.destination ?? "api",
      };
      await $.add(
        "project/smoke-counterfact.mjs",
        `import assert from "node:assert/strict";
        import path from "node:path";
        import { counterfact } from "counterfact";
        const simulator = await counterfact({
          openApiPath: path.resolve(${JSON.stringify(config.spec)}), basePath: path.resolve(${JSON.stringify(config.destination)}),
          port: 0, generate: { routes: false, types: false }, watch: { routes: false, types: false },
          startServer: true, startRepl: false,
        });
        const running = await simulator.start();
        try {
          const status = simulator.status();
          const response = await fetch(\`http://127.0.0.1:\${status.address.port}${smoke.path}\`, {
            method: ${JSON.stringify(smoke.method)}, headers: { "content-type": "application/json" },
            body: ${smoke.body ? `JSON.stringify(${JSON.stringify(smoke.body)})` : "undefined"},
          });
          assert.equal(response.status, ${smoke.status});
          assert.deepEqual(await response.json(), ${JSON.stringify(smoke.expected ?? smoke.body)});
          console.log("Real Counterfact HTTP response matched the generated SDK model example.");
        } finally { await running.stop(); }
      `,
      );
      await run(process.execPath, ["smoke-counterfact.mjs"], $.path("project"));
      report.httpPassed = true;
      report.passed = true;
      console.log(
        `${name}: real generator, Counterfact CLI, compiler checks, and HTTP smoke passed.`,
      );
    } catch (error) {
      report.error = error.stack;
      report.stdout = error.stdout;
      report.stderr = error.stderr;
      throw error;
    } finally {
      await $.add(`${artifacts}/report.json`, JSON.stringify(report, null, 2));
      try {
        const configJson = ts.readConfigFile(
          $.path("project/tsconfig.json"),
          ts.sys.readFile,
        );
        const parsed = ts.parseJsonConfigFileContent(
          configJson.config,
          ts.sys,
          $.path("project"),
        );
        const program = ts.createProgram(parsed.fileNames, parsed.options);
        for (const source of program.getSourceFiles()) {
          const relativeSource = path.relative(
            $.path("project"),
            source.fileName,
          );
          if (
            !relativeSource.startsWith("..") &&
            !relativeSource.startsWith("node_modules/")
          )
            await $.add(`${artifacts}/project/${relativeSource}`, source.text);
        }
        for (const file of [
          "package.json",
          "counterfact.yaml",
          "schema-type-transform.mjs",
          "tsconfig.json",
          "smoke-counterfact.mjs",
        ])
          await $.add(
            `${artifacts}/project/${file}`,
            await $.read(`project/${file}`),
          );
      } catch (error) {
        console.error(`Output capture: ${error.message}`);
      }
    }
  });
}
if (selected !== "--list") {
  for (const name of selected ? [selected] : Object.keys(cases))
    await verify(name, cases[name]);
}
