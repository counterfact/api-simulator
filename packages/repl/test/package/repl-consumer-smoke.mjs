import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDirectory, "../..");
const clientPackageRoot = path.resolve(packageRoot, "../client");
const openApiPackageRoot = path.resolve(packageRoot, "../openapi");
const runtimePackageRoot = path.resolve(packageRoot, "../runtime");
const typesPackageRoot = path.resolve(packageRoot, "../types");

function executable(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

async function run(command, args, cwd) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: false,
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
  path.join(tmpdir(), "counterfact-repl-consumer-"),
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

  const packageRoots = [
    typesPackageRoot,
    openApiPackageRoot,
    clientPackageRoot,
    runtimePackageRoot,
    packageRoot,
  ];
  const tarballs = [];
  for (const root of packageRoots) {
    tarballs.push(await pack(root, tarballDirectory, cacheDirectory));
  }

  await writeFile(
    path.join(consumerDirectory, "package.json"),
    `${JSON.stringify({ name: "repl-consumer", private: true, type: "module" }, undefined, 2)}\n`,
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
      ...tarballs,
    ],
    consumerDirectory,
  );

  await writeFile(
    path.join(consumerDirectory, "consume.mjs"),
    `import assert from "node:assert/strict";
import { createOpenApiRouteCatalog } from "@counterfact/client";
import { createCompleter, startRepl } from "@counterfact/repl";

assert.equal(typeof startRepl, "function");
const registry = { routes: [{ methods: {}, path: "/fallback" }] };
const catalog = createOpenApiRouteCatalog({ paths: { "/pets/{petId}": { get: {} } } });
const completer = createCompleter(registry, undefined, catalog);
let callbackCount = 0;
const routeCompletion = await new Promise((resolve, reject) => {
  completer('route("/pe', (error, result) => {
    callbackCount += 1;
    if (error) reject(error); else resolve(result);
  });
});
assert.deepEqual(routeCompletion, [["/pets/{petId}"], "/pe"]);
assert.equal(callbackCount, 1);

let methodCallbackCount = 0;
completer('route("/pets").', (error, result) => {
  assert.equal(error, null);
  assert(result[0].includes("send("));
  methodCallbackCount += 1;
});
assert.equal(methodCallbackCount, 1);
`,
  );

  await run(executable("node"), ["consume.mjs"], consumerDirectory);
  process.stdout.write("Packed @counterfact/repl consumer passed.\n");
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
