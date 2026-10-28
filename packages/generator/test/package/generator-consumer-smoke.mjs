import assert from "node:assert/strict";
import { usingTemporaryFiles } from "using-temporary-files";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDirectory, "../..");
const openApiPackageRoot = path.resolve(packageRoot, "../openapi");
const typesPackageRoot = path.resolve(packageRoot, "../types");

function executable(name) {
  return name === "node" ? process.execPath : name;
}

async function run(command, args, cwd) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: process.platform === "win32" && command !== process.execPath,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let stdout = "";

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr, stdout }));
  });

  if (result.code !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.code})\n${result.stdout}\n${result.stderr}`,
    );
  }

  return result;
}

async function pack(packageDirectory, tarballDirectory, cacheDirectory) {
  const result = await run(
    executable("npm"),
    [
      "pack",
      "--json",
      "--pack-destination",
      tarballDirectory,
      "--cache",
      cacheDirectory,
    ],
    packageDirectory,
  );
  const jsonStart = Math.max(
    result.stdout.lastIndexOf("\n["),
    result.stdout.startsWith("[") ? 0 : -1,
  );
  const [metadata] = JSON.parse(
    result.stdout.slice(jsonStart === 0 ? 0 : jsonStart + 1),
  );

  assert(metadata, "npm pack did not describe a tarball");
  return path.join(tarballDirectory, metadata.filename);
}

const temporaryRoot = await mkdtemp(
  path.join(tmpdir(), "counterfact-generator-consumer-"),
);
try {
  const cacheDirectory = path.join(temporaryRoot, "npm-cache");
  const consumerDirectory = path.join(temporaryRoot, "consumer");
  const tarballDirectory = path.join(temporaryRoot, "tarballs");
  await Promise.all([
    mkdir(cacheDirectory),
    mkdir(consumerDirectory),
    mkdir(tarballDirectory),
  ]);

  const generatorTarball = await pack(
    packageRoot,
    tarballDirectory,
    cacheDirectory,
  );
  const openApiTarball = await pack(
    openApiPackageRoot,
    tarballDirectory,
    cacheDirectory,
  );
  const typesTarball = await pack(
    typesPackageRoot,
    tarballDirectory,
    cacheDirectory,
  );

  await writeFile(
    path.join(consumerDirectory, "package.json"),
    `${JSON.stringify({ name: "generator-consumer", private: true, type: "module" }, undefined, 2)}\n`,
  );
  await run(
    executable("npm"),
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--cache",
      cacheDirectory,
      openApiTarball,
      typesTarball,
      generatorTarball,
    ],
    consumerDirectory,
  );

  const openApiPath = path.join(consumerDirectory, "openapi.yaml");
  const outputPath = path.join(consumerDirectory, "api");
  await writeFile(
    openApiPath,
    `openapi: 3.0.3
info:
  title: Installed generator
  version: 1.0.0
paths:
  /health:
    get:
      operationId: getHealth
      responses:
        "204":
          description: Healthy
components:
  schemas:
    HealthStatus:
      type: string
`,
  );
  await writeFile(
    path.join(consumerDirectory, "generate.mjs"),
    `import { CodeGenerator, ScenarioFileGenerator } from "@counterfact/generator";
await new CodeGenerator(${JSON.stringify(openApiPath)}, ${JSON.stringify(outputPath)}, {
  routes: true,
  types: true,
}).generate();
await new ScenarioFileGenerator(${JSON.stringify(outputPath)}).generate();
`,
  );
  await run(executable("node"), ["generate.mjs"], consumerDirectory);

  assert.match(
    await readFile(path.join(outputPath, "routes", "health.ts"), "utf8"),
    /export const GET/u,
  );
  assert.match(
    await readFile(
      path.join(outputPath, "types", "paths", "health.types.ts"),
      "utf8",
    ),
    /export type HTTP_GET/u,
  );
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "consumer.ts",
      `
import type { Components, Routes, Schemas, Context$, Scenario, Scenario$, Middleware } from ${JSON.stringify(path.join(outputPath, "types/index.js"))};
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const alias: Same<Schemas, Components["schemas"]> = true;
const model: Schemas["HealthStatus"] = "healthy";
const same: Components["schemas"]["HealthStatus"] = model;
const handler: Routes["/health"]["GET"] = ($) => $.response.status(204).empty();
const startup: Scenario = ($) => { const arg: Scenario$ = $; void arg.context; };
const middleware: Middleware["/"] = ($, next) => next($);
function constructorHelper($: Context$) { const json: Promise<unknown> = $.readJson("seed.json"); }
// @ts-expect-error HealthStatus is a string.
const invalid: Schemas["HealthStatus"] = 123;
`,
    );
    await run(
      executable("node"),
      [
        "node_modules/typescript/bin/tsc",
        "--noEmit",
        "--strict",
        "--skipLibCheck",
        "--target",
        "es2022",
        "--module",
        "esnext",
        "--moduleResolution",
        "bundler",
        "--allowImportingTsExtensions",
        $.path("consumer.ts"),
      ],
      consumerDirectory,
    );
  });
  await access(path.join(outputPath, "counterfact-types", "index.ts"));
  await access(
    path.join(
      consumerDirectory,
      "node_modules",
      "@counterfact",
      "generator",
      "dist",
      "templates",
      "counterfact-types",
      "index.ts",
    ),
  );
  await assert.rejects(
    access(path.join(consumerDirectory, "node_modules", "counterfact")),
  );

  process.stdout.write("installed generator consumer smoke test passed\n");
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
