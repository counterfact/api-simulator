import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDirectory, "../..");
const generatorPackageRoot = path.resolve(packageRoot, "../generator");
const openApiPackageRoot = path.resolve(packageRoot, "../openapi");
const typesPackageRoot = path.resolve(packageRoot, "../types");
const fixturesDirectory = path.join(testDirectory, "fixtures");
const updateFixtures = process.argv.includes("--update-fixtures");
const expectedPackFilesPath = path.join(fixturesDirectory, "pack-files.json");
const expectedGeneratedFilesPath = path.join(
  fixturesDirectory,
  "generated-files.json",
);

function executable(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

async function run(command, args, options = {}) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? packageRoot,
      env: { ...process.env, ...options.env },
      shell: options.shell ?? false,
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
      [
        `Command failed (${result.code}): ${command} ${args.join(" ")}`,
        result.stdout,
        result.stderr,
      ].join("\n"),
    );
  }

  return result;
}

async function json(pathname) {
  return JSON.parse(await readFile(pathname, "utf8"));
}

async function packPackage(packageDirectory, tarballDirectory, cacheDirectory) {
  const packResult = await run(
    executable("npm"),
    [
      "pack",
      "--json",
      "--pack-destination",
      tarballDirectory,
      "--cache",
      cacheDirectory,
    ],
    { cwd: packageDirectory },
  );
  const packJsonStart = Math.max(
    packResult.stdout.lastIndexOf("\n["),
    packResult.stdout.startsWith("[") ? 0 : -1,
  );
  assert(packJsonStart >= 0, "npm pack did not return JSON metadata");
  const [pack] = JSON.parse(
    packResult.stdout.slice(packJsonStart === 0 ? 0 : packJsonStart + 1),
  );
  assert(pack, "npm pack did not describe a tarball");

  return pack;
}

function normalizeText(content) {
  return content.replaceAll("\r\n", "\n");
}

async function fileHashes(directory) {
  const hashes = {};

  async function visit(currentDirectory) {
    const entries = await readdir(currentDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }

      const relativePath = path
        .relative(directory, absolutePath)
        .split(path.sep)
        .join("/");
      const content = normalizeText(await readFile(absolutePath, "utf8"));
      hashes[relativePath] = createHash("sha256").update(content).digest("hex");
    }
  }

  await visit(directory);
  return Object.fromEntries(
    Object.entries(hashes).sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function compareOrUpdate(pathname, actual) {
  if (updateFixtures) {
    await writeFile(pathname, `${JSON.stringify(actual, undefined, 2)}\n`);
    return;
  }

  assert.deepEqual(actual, await json(pathname));
}

const temporaryRoot = await mkdtemp(
  path.join(tmpdir(), "counterfact-packed-consumer-"),
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

  const pack = await packPackage(packageRoot, tarballDirectory, cacheDirectory);
  const packFiles = pack.files
    .map(({ path: packedPath }) => packedPath.split(path.sep).join("/"))
    .sort();
  const publicPackFiles = packFiles.filter(
    (packedPath) =>
      !packedPath.startsWith("bin/") && !packedPath.startsWith("dist/"),
  );
  await compareOrUpdate(expectedPackFilesPath, publicPackFiles);

  const tarballPath = path.join(tarballDirectory, pack.filename);
  const generatorPack = await packPackage(
    generatorPackageRoot,
    tarballDirectory,
    cacheDirectory,
  );
  const generatorTarballPath = path.join(
    tarballDirectory,
    generatorPack.filename,
  );
  const openApiPack = await packPackage(
    openApiPackageRoot,
    tarballDirectory,
    cacheDirectory,
  );
  const openApiTarballPath = path.join(tarballDirectory, openApiPack.filename);
  const typesPack = await packPackage(
    typesPackageRoot,
    tarballDirectory,
    cacheDirectory,
  );
  const typesTarballPath = path.join(tarballDirectory, typesPack.filename);
  await copyFile(
    path.join(fixturesDirectory, "openapi.yaml"),
    path.join(consumerDirectory, "openapi.yaml"),
  );
  await writeFile(
    path.join(consumerDirectory, "package.json"),
    `${JSON.stringify({ name: "counterfact-packed-consumer", private: true, type: "module" }, undefined, 2)}\n`,
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
      generatorTarballPath,
      openApiTarballPath,
      typesTarballPath,
      tarballPath,
    ],
    { cwd: consumerDirectory },
  );

  const installedRoot = path.join(
    consumerDirectory,
    "node_modules",
    "counterfact",
  );
  const installedManifest = await json(
    path.join(installedRoot, "package.json"),
  );
  const expectedManifest = await json(
    path.join(fixturesDirectory, "compatibility-manifest.json"),
  );
  for (const field of ["engines", "name", "sideEffects", "type"]) {
    assert.deepEqual(installedManifest[field], expectedManifest[field], field);
  }
  assert.deepEqual(Object.keys(installedManifest.bin ?? {}), ["counterfact"]);
  assert.deepEqual(Object.keys(installedManifest.exports ?? {}), ["."]);

  for (const requiredPath of [
    "README.md",
    "llms.txt",
    "docs/features/route-builder.md",
    "docs/patterns/scenario-scripts.md",
    "docs/reference.md",
  ]) {
    assert(
      packFiles.includes(requiredPath),
      `Missing packed file: ${requiredPath}`,
    );
  }
  for (const forbiddenPrefix of [
    ".github/",
    "docs/adr/",
    "docs/bug-reports/",
    "docs/development/",
    "examples/",
    "site/",
    "src/",
    "test/",
  ]) {
    assert(
      !packFiles.some((packedPath) => packedPath.startsWith(forbiddenPrefix)),
      `Unexpected packed path: ${forbiddenPrefix}`,
    );
  }

  const runtimeCheckPath = path.join(consumerDirectory, "runtime-check.mjs");
  await writeFile(
    runtimeCheckPath,
    `import assert from "node:assert/strict";
import path from "node:path";
import * as counterfactPackage from "counterfact";

assert.deepEqual(Object.keys(counterfactPackage).sort(), ${JSON.stringify(expectedManifest.runtimeExports)});
await assert.rejects(import("counterfact/dist/app.js"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });

const config = {
  alwaysFakeOptionals: false,
  basePath: path.resolve("api"),
  buildCache: false,
  generate: { routes: false, types: false },
  openApiPath: "_",
  port: 0,
  prefix: "",
  proxyPaths: new Map(),
  proxyUrl: "",
  startRepl: false,
  startServer: false,
  validateRequests: true,
  validateResponses: true,
  watch: { routes: false, types: false },
};
const simulator = await counterfactPackage.counterfact(config);
const running = await simulator.start(config);
await running.stop();
`,
  );
  await run(process.execPath, [runtimeCheckPath], {
    cwd: consumerDirectory,
    env: { CI: "true", COUNTERFACT_TELEMETRY_DISABLED: "true" },
  });

  const installedBinary = path.join(
    consumerDirectory,
    "node_modules",
    ".bin",
    executable("counterfact"),
  );
  const installedBinaryOptions = {
    cwd: consumerDirectory,
    env: { CI: "true", COUNTERFACT_TELEMETRY_DISABLED: "true" },
    shell: process.platform === "win32",
  };
  const versionResult = await run(
    installedBinary,
    ["--version"],
    installedBinaryOptions,
  );
  assert.equal(versionResult.stdout.trim(), installedManifest.version);
  const helpResult = await run(
    installedBinary,
    ["--help"],
    installedBinaryOptions,
  );
  for (const option of [
    "--generate",
    "--serve",
    "--repl",
    "--overlay",
    "--config",
  ]) {
    assert(helpResult.stdout.includes(option), `Missing CLI option: ${option}`);
  }

  const generatedDirectory = path.join(consumerDirectory, "generated");
  await run(
    installedBinary,
    [
      path.join(consumerDirectory, "openapi.yaml"),
      generatedDirectory,
      "--generate",
      "--no-update-check",
    ],
    installedBinaryOptions,
  );

  for (const requiredGeneratedPath of [
    "counterfact-types/index.ts",
    "routes/ping.ts",
    "scenarios/index.ts",
    "types/paths/ping.types.ts",
  ]) {
    await readFile(path.join(generatedDirectory, requiredGeneratedPath));
  }
  assert(
    Object.keys(await fileHashes(generatedDirectory)).some((generatedPath) =>
      generatedPath.includes("with∶colon"),
    ),
    "The generated tree did not preserve the Windows-safe colon path",
  );
  await compareOrUpdate(
    expectedGeneratedFilesPath,
    await fileHashes(generatedDirectory),
  );

  await writeFile(
    path.join(consumerDirectory, "consumer.ts"),
    `import { loadOpenApiDocument } from "@counterfact/openapi";
import type { Middleware } from "@counterfact/types";
import { counterfact, type MockRequest, type SpecConfig } from "counterfact";

const spec: SpecConfig = { group: "smoke", source: "./openapi.yaml" };
declare const middleware: Middleware;
declare const request: MockRequest;
void counterfact;
void loadOpenApiDocument;
void middleware;
void request;
void spec;
`,
  );
  await writeFile(
    path.join(consumerDirectory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          noEmit: true,
          skipLibCheck: true,
          strict: true,
          target: "ES2022",
          types: [],
        },
        include: ["consumer.ts", "generated/**/*.ts"],
      },
      undefined,
      2,
    )}\n`,
  );
  await run(
    process.execPath,
    [
      path.join(consumerDirectory, "node_modules", "typescript", "bin", "tsc"),
      "--project",
      path.join(consumerDirectory, "tsconfig.json"),
    ],
    { cwd: consumerDirectory },
  );

  process.stdout.write(
    updateFixtures
      ? "Updated packed-consumer compatibility fixtures.\n"
      : "Packed-consumer compatibility checks passed.\n",
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
