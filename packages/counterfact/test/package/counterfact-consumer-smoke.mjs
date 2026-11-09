import assert from "node:assert/strict";
import { usingTemporaryFiles } from "using-temporary-files";
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
const clientPackageRoot = path.resolve(packageRoot, "../client");
const generatorPackageRoot = path.resolve(packageRoot, "../generator");
const openApiPackageRoot = path.resolve(packageRoot, "../openapi");
const replPackageRoot = path.resolve(packageRoot, "../repl");
const runtimePackageRoot = path.resolve(packageRoot, "../runtime");
const typesPackageRoot = path.resolve(packageRoot, "../types");
const fixturesDirectory = path.join(testDirectory, "fixtures");
const updateFixtures = process.argv.includes("--update-fixtures");
const expectedPackFilesPath = path.join(fixturesDirectory, "pack-files.json");
const expectedGeneratedFilesPath = path.join(
  fixturesDirectory,
  "generated-files.json",
);

function executable(name) {
  return name === "node" ? process.execPath : name;
}

async function run(command, args, options = {}) {
  const started = performance.now();
  const result = await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? packageRoot,
      env: { ...process.env, ...options.env },
      shell:
        options.shell ??
        (process.platform === "win32" && command !== process.execPath),
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

  process.stdout.write(
    `${path.basename(command)} ${args
      .slice(0, 2)
      .map((argument) =>
        path.isAbsolute(argument) ? path.basename(argument) : argument,
      )
      .join(" ")}: ${((performance.now() - started) / 1000).toFixed(1)}s\n`,
  );
  return result;
}

async function json(pathname) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- The smoke harness intentionally accesses its temporary consumers, configured npm cache, and checked-in compatibility fixtures.
  return JSON.parse(await readFile(pathname, "utf8"));
}

async function packPackage(packageDirectory, tarballDirectory, cacheDirectory) {
  const packResult = await run(
    executable("npm"),
    [
      "pack",
      ...(packageDirectory === packageRoot ? [] : ["--ignore-scripts"]),
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
  const hashes = new Map();

  async function visit(currentDirectory) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- The smoke harness intentionally accesses its temporary consumers, configured npm cache, and checked-in compatibility fixtures.
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
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- The smoke harness intentionally accesses its temporary consumers, configured npm cache, and checked-in compatibility fixtures.
      const content = normalizeText(await readFile(absolutePath, "utf8"));
      hashes.set(
        relativePath,
        createHash("sha256").update(content).digest("hex"),
      );
    }
  }

  await visit(directory);
  return Object.fromEntries(
    [...hashes].sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function compareOrUpdate(pathname, actual) {
  if (updateFixtures) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Only explicit --update-fixtures mode writes this harness-selected compatibility fixture.
    await writeFile(pathname, `${JSON.stringify(actual, undefined, 2)}\n`);
    return;
  }

  assert.deepEqual(actual, await json(pathname));
}

export async function verifyPackedConsumer({ consumerDirectory, pack }) {
  const packFiles = pack.files
    .map(({ path: packedPath }) => packedPath.split(path.sep).join("/"))
    .sort();
  const publicPackFiles = packFiles.filter(
    (packedPath) =>
      !packedPath.startsWith("bin/") && !packedPath.startsWith("dist/"),
  );
  await compareOrUpdate(expectedPackFilesPath, publicPackFiles);

  await copyFile(
    path.join(fixturesDirectory, "openapi.yaml"),
    path.join(consumerDirectory, "openapi.yaml"),
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
    // eslint-disable-next-line security/detect-object-injection -- field comes from the fixed compatibility-field list above; both values are parsed package manifests.
    assert.deepEqual(installedManifest[field], expectedManifest[field], field);
  }
  const installedBins =
    typeof installedManifest.bin === "string"
      ? { [installedManifest.name]: installedManifest.bin }
      : (installedManifest.bin ?? {});
  assert.deepEqual(installedBins, {
    counterfact: "bin/counterfact.js",
  });
  assert.deepEqual(Object.keys(installedManifest.exports ?? {}), ["."]);

  for (const requiredPath of [
    "README.md",
    "llms.txt",
    "docs/features/route-builder.md",
    "docs/patterns/scenario-scripts.md",
    "docs/manual.md",
    "docs/api.md",
    "docs/api/cli.md",
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
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- The smoke harness intentionally accesses its temporary consumers, configured npm cache, and checked-in compatibility fixtures.
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

  const installedRuntimeRoot = path.join(
    consumerDirectory,
    "node_modules",
    "@counterfact",
    "runtime",
  );
  const installedRuntimeManifest = await json(
    path.join(installedRuntimeRoot, "package.json"),
  );
  assert.equal(installedRuntimeManifest.dependencies.counterfact, undefined);
  assert.equal(
    installedRuntimeManifest.dependencies["@counterfact/generator"],
    undefined,
  );
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- The smoke harness intentionally accesses its temporary consumers, configured npm cache, and checked-in compatibility fixtures.
  await readFile(
    path.join(installedRuntimeRoot, "dist", "server", "uncached-require.cjs"),
  );
  const runtimeConsumerPath = path.join(
    consumerDirectory,
    "runtime-consumer.mjs",
  );
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- The smoke harness intentionally accesses its temporary consumers, configured npm cache, and checked-in compatibility fixtures.
  await writeFile(
    runtimeConsumerPath,
    `import assert from "node:assert/strict";
import { ContextRegistry, Dispatcher, Registry } from "@counterfact/runtime";
import { createKoaApp } from "@counterfact/runtime/koa";
import { createMswHandlers } from "@counterfact/runtime/msw";

const registry = new Registry();
registry.add("/ping", { GET: () => ({ body: "pong" }) });
const dispatcher = new Dispatcher(registry, new ContextRegistry());
const response = await dispatcher.request({
  body: undefined,
  headers: {},
  method: "GET",
  path: "/ping",
  query: {},
  req: {},
});
assert.equal(response.body, "pong");
assert.equal(typeof createKoaApp, "function");
assert.equal(typeof createMswHandlers, "function");
`,
  );
  await run(process.execPath, [runtimeConsumerPath], {
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
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- The smoke harness intentionally accesses its temporary consumers, configured npm cache, and checked-in compatibility fixtures.
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

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- The smoke harness intentionally accesses its temporary consumers, configured npm cache, and checked-in compatibility fixtures.
  await writeFile(
    path.join(consumerDirectory, "consumer.ts"),
    `import { loadOpenApiDocument } from "@counterfact/openapi";
import type { Middleware } from "@counterfact/types";
import { counterfact, type MockRequest, type SpecConfig, type SchemaTypeTransform } from "counterfact";

export const transform: SchemaTypeTransform = (schema, defaultType, script) => {
  if (typeof schema === "object" && schema.format === "uuid") return script.importType("node:buffer", "Buffer");
  return defaultType;
};
void counterfact({ basePath: "api", schemaTypeTransform: transform });
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
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- The smoke harness intentionally accesses its temporary consumers, configured npm cache, and checked-in compatibility fixtures.
  await writeFile(
    path.join(consumerDirectory, "runtime-consumer.ts"),
    `import { ContextRegistry, Dispatcher, Registry } from "@counterfact/runtime";
import { createKoaApp, type RuntimeRunner } from "@counterfact/runtime/koa";
import { createMswHandlers, type MockRequest } from "@counterfact/runtime/msw";

declare const request: MockRequest;
declare const runner: RuntimeRunner;
void new ContextRegistry();
void Dispatcher;
void Registry;
void createKoaApp;
void createMswHandlers;
void request;
void runner;
`,
  );
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- The smoke harness intentionally accesses its temporary consumers, configured npm cache, and checked-in compatibility fixtures.
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
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- The smoke harness intentionally accesses its temporary consumers, configured npm cache, and checked-in compatibility fixtures.
  await writeFile(
    path.join(consumerDirectory, "runtime-tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          noEmit: true,
          skipLibCheck: false,
          strict: true,
          target: "ES2022",
          types: [],
        },
        include: ["runtime-consumer.ts"],
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
      path.join(consumerDirectory, "runtime-tsconfig.json"),
    ],
    { cwd: consumerDirectory },
  );

  let schemaTypeDocs = "";
  const codeBlockAfter = (heading) => {
    const start = schemaTypeDocs.indexOf(heading);
    assert(start !== -1, `Missing documented heading: ${heading}`);
    const match = schemaTypeDocs
      .slice(start + heading.length)
      .match(/```[^\n]*\n([\s\S]*?)\n```/u);
    assert(match, `Missing code block after ${heading}`);
    return match[1] + "\n";
  };
  // Keep the temporary example below the installed consumer so Node and tsc
  // resolve the same public package imports shown in the documentation.
  const temporaryVariables = ["TMPDIR", "TMP", "TEMP"];
  const originalTemporaryEnvironment = temporaryVariables.map((name) => [
    name,
    process.env[name],
  ]);
  for (const name of temporaryVariables) {
    process.env[name] = consumerDirectory;
  }
  try {
    await usingTemporaryFiles(async ($) => {
      const docDirectory = $.path(".");
      schemaTypeDocs = await $.read(
        path.relative(
          docDirectory,
          path.join(installedRoot, "docs/api/schema-types.md"),
        ),
      );
      for (const name of [
        "package.json",
        "openapi.yaml",
        "counterfact.yaml",
        "schema-type-transform.mjs",
        "consumer.ts",
        "tsconfig.json",
      ]) {
        await $.add(name, codeBlockAfter("### `" + name + "`"));
      }
      const docCliOptions = { ...installedBinaryOptions, cwd: docDirectory };
      const docConfig = path.join(docDirectory, "counterfact.yaml");
      const generateDocs = () =>
        run(
          installedBinary,
          ["--config", docConfig, "--no-update-check"],
          docCliOptions,
        );
      const checkDocs = () =>
        run(
          process.execPath,
          [
            path.join(consumerDirectory, "node_modules/typescript/bin/tsc"),
            "--project",
            path.join(docDirectory, "tsconfig.json"),
          ],
          { cwd: docDirectory },
        );
      await generateDocs();
      const invoicePath = path.join(
        docDirectory,
        "api/types/components/schemas/Invoice.ts",
      );
      const invoice = await $.read(path.relative(docDirectory, invoicePath));
      assert.match(invoice, /total: bigint \| null/u);
      assert.match(invoice, /id: string/u);
      await checkDocs();
      const originalDocConfig = await $.read("counterfact.yaml");
      await $.add(
        "counterfact.yaml",
        originalDocConfig.replace(/^schema-type-transform:.*\n/gmu, ""),
      );
      await generateDocs();
      await assert.rejects(
        checkDocs,
        (error) =>
          error.message.includes("bigint") &&
          error.message.includes("Unused '@ts-expect-error'"),
      );
      await $.add("counterfact.yaml", originalDocConfig);
      await generateDocs();
      await checkDocs();
      const programmaticExample = path.join(docDirectory, "generate.mjs");
      await $.add("generate.mjs", codeBlockAfter("## Programmatic generation"));
      await run(process.execPath, [programmaticExample], { cwd: docDirectory });
      await checkDocs();
    });
  } finally {
    for (const [name, value] of originalTemporaryEnvironment) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }

  const configDirectory = path.join(consumerDirectory, "settings");
  await mkdir(configDirectory);
  await writeFile(
    path.join(consumerDirectory, "extension.json"),
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Configured type extension", version: "1" },
      paths: {
        "/id": {
          get: {
            responses: {
              200: {
                description: "Identifier",
                content: {
                  "application/json": {
                    schema: {
                      type: "string",
                      format: "binary",
                      "x-node-buffer": true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
  );
  await writeFile(
    path.join(configDirectory, "counterfact.yaml"),
    "spec: ./extension.json\ndestination: ./customized\nschema-type-transform: ./transform.mjs\n",
  );
  await writeFile(
    path.join(configDirectory, "transform.mjs"),
    codeBlockAfter("## Import an existing type"),
  );
  await run(
    installedBinary,
    [
      "--config",
      path.join(configDirectory, "counterfact.yaml"),
      "--generate",
      "--no-update-check",
    ],
    installedBinaryOptions,
  );
  const customized = await readFile(
    path.join(consumerDirectory, "customized/types/paths/id.types.ts"),
    "utf8",
  );
  assert.match(customized, /from "node:buffer"/u);
  assert.match(customized, /Buffer as /u);

  process.stdout.write(
    updateFixtures
      ? "Updated packed-consumer compatibility fixtures.\n"
      : "Packed-consumer compatibility checks passed.\n",
  );
}

async function main() {
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "counterfact-packed-consumer-"),
  );

  try {
    const cacheDirectory =
      process.env.COUNTERFACT_PACKAGE_CACHE ??
      path.join(tmpdir(), "counterfact-package-npm-cache");
    const consumerDirectory = path.join(temporaryRoot, "consumer");
    const tarballDirectory = path.join(temporaryRoot, "tarballs");
    await Promise.all([
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- The smoke harness intentionally accesses its temporary consumers, configured npm cache, and checked-in compatibility fixtures.
      mkdir(cacheDirectory, { recursive: true }),
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- The smoke harness intentionally accesses its temporary consumers, configured npm cache, and checked-in compatibility fixtures.
      mkdir(consumerDirectory),
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- The smoke harness intentionally accesses its temporary consumers, configured npm cache, and checked-in compatibility fixtures.
      mkdir(tarballDirectory),
    ]);

    const pack = await packPackage(
      packageRoot,
      tarballDirectory,
      cacheDirectory,
    );
    const tarballPath = path.join(tarballDirectory, pack.filename);
    const clientPack = await packPackage(
      clientPackageRoot,
      tarballDirectory,
      cacheDirectory,
    );
    const clientTarballPath = path.join(tarballDirectory, clientPack.filename);
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
    const openApiTarballPath = path.join(
      tarballDirectory,
      openApiPack.filename,
    );
    const replPack = await packPackage(
      replPackageRoot,
      tarballDirectory,
      cacheDirectory,
    );
    const replTarballPath = path.join(tarballDirectory, replPack.filename);
    const runtimePack = await packPackage(
      runtimePackageRoot,
      tarballDirectory,
      cacheDirectory,
    );
    const runtimeTarballPath = path.join(
      tarballDirectory,
      runtimePack.filename,
    );
    const typesPack = await packPackage(
      typesPackageRoot,
      tarballDirectory,
      cacheDirectory,
    );
    const typesTarballPath = path.join(tarballDirectory, typesPack.filename);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- The smoke harness intentionally accesses its temporary consumers, configured npm cache, and checked-in compatibility fixtures.
    await writeFile(
      path.join(consumerDirectory, "package.json"),
      `${JSON.stringify({ name: "counterfact-packed-consumer", private: true, type: "module" }, undefined, 2)}\n`,
    );

    await run(
      executable("npm"),
      [
        "install",
        "--ignore-scripts",
        "--prefer-offline",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        "--cache",
        cacheDirectory,
        clientTarballPath,
        generatorTarballPath,
        openApiTarballPath,
        replTarballPath,
        runtimeTarballPath,
        typesTarballPath,
        tarballPath,
      ],
      { cwd: consumerDirectory },
    );

    await verifyPackedConsumer({ consumerDirectory, pack });
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
