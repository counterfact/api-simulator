import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

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

  if (result.code !== 0 && !options.allowFailure) {
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

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? packageRoot,
    env: options.env ?? process.env,
    shell:
      options.shell ??
      (process.platform === "win32" && command !== process.execPath),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = { stderr: "", stdout: "" };
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    output.stderr += chunk;
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output.stdout += chunk;
  });
  const completed = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal, ...output }));
  });

  return { child, completed, output };
}

async function waitUntil(check, message, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(message);
}

async function listenOnEphemeralPort(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");

  return address.port;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function reserveEphemeralPort() {
  const server = createServer();
  const port = await listenOnEphemeralPort(server);
  await closeServer(server);

  return port;
}

function parseCapturedEvents(requestBodies) {
  return requestBodies.flatMap((body) => {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.batch)) return parsed.batch;

    return [parsed];
  });
}

async function sendApiRequest({ body, headers, path: requestPath, port }) {
  await new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        headers: {
          "content-length": Buffer.byteLength(body),
          "content-type": "application/json",
          ...headers,
        },
        hostname: "127.0.0.1",
        method: "POST",
        path: requestPath,
        port,
      },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode));
      },
    );
    request.once("error", reject);
    request.end(body);
  });
}

function telemetryEnvironment(overrides) {
  return {
    ...process.env,
    CI: "",
    COUNTERFACT_TELEMETRY_DISABLED: "",
    ...overrides,
  };
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
  const openApiTarballPath = path.join(tarballDirectory, openApiPack.filename);
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
  const runtimeTarballPath = path.join(tarballDirectory, runtimePack.filename);
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
  const installedBins =
    typeof installedManifest.bin === "string"
      ? { [installedManifest.name]: installedManifest.bin }
      : (installedManifest.bin ?? {});
  assert.deepEqual(installedBins, {
    counterfact: "bin/counterfact.js",
  });
  assert.deepEqual(Object.keys(installedManifest.exports ?? {}), ["."]);

  const requiredPackagePaths = [
    "README.md",
    "llms.txt",
    "docs/examples/index.md",
    "docs/examples/playwright-error-states.md",
    "docs/examples/react-vite.md",
    "docs/features/route-builder.md",
    "docs/patterns/scenario-scripts.md",
    "docs/reference.md",
  ];
  for (const requiredPath of requiredPackagePaths) {
    assert(
      packFiles.includes(requiredPath),
      `Missing packed file: ${requiredPath}`,
    );
    await readFile(path.join(installedRoot, requiredPath));
  }
  for (const forbiddenPrefix of [
    ".github/",
    "docs/adr/",
    "docs/bug-reports/",
    "docs/development/",
    "docs/marketing/",
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
  await readFile(
    path.join(installedRuntimeRoot, "dist", "server", "uncached-require.cjs"),
  );
  const runtimeConsumerPath = path.join(
    consumerDirectory,
    "runtime-consumer.mjs",
  );
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

  const capturedTelemetryBodies = [];
  const telemetryCollector = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const compressedBody = Buffer.concat(chunks);
      const body =
        request.headers["content-encoding"] === "gzip"
          ? gunzipSync(compressedBody)
          : compressedBody;
      capturedTelemetryBodies.push(body.toString("utf8"));
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"status":"ok"}');
    });
  });
  const telemetryPort = await listenOnEphemeralPort(telemetryCollector);
  const telemetryHost = `http://127.0.0.1:${telemetryPort}`;

  try {
    const sourceLocationSentinel = "private-openapi-location-sentinel";
    const requestPathSentinel = "private-request-path-sentinel";
    const querySentinel = "private-query-sentinel";
    const headerSentinel = "private-header-sentinel";
    const bearerTokenSentinel = "private-bearer-token-sentinel";
    const bodySentinel = "private-json-body-sentinel";
    const wireSpecPath = path.join(
      consumerDirectory,
      `${sourceLocationSentinel}.yaml`,
    );
    await writeFile(
      wireSpecPath,
      `openapi: 3.0.3
info:
  title: Telemetry wire test
  version: 1.0.0
paths:
  /wire/${requestPathSentinel}:
    post:
      operationId: telemetryWireTest
      requestBody:
        content:
          application/json:
            schema:
              type: object
              additionalProperties: true
      responses:
        "200":
          description: accepted
          content:
            application/json:
              schema:
                type: object
`,
    );

    const successConfigRoot = path.join(temporaryRoot, "telemetry-success");
    const apiPort = await reserveEphemeralPort();
    const successProcess = start(
      installedBinary,
      [
        wireSpecPath,
        path.join(consumerDirectory, "wire-generated"),
        "--generate",
        "--serve",
        "--port",
        String(apiPort),
        "--no-update-check",
      ],
      {
        cwd: consumerDirectory,
        env: telemetryEnvironment({
          NO_COLOR: "1",
          POSTHOG_API_KEY: "wire-test-key",
          POSTHOG_HOST: telemetryHost,
          XDG_CONFIG_HOME: successConfigRoot,
        }),
        shell: process.platform === "win32",
      },
    );

    try {
      await waitUntil(
        () => successProcess.output.stdout.includes("Mock server"),
        `Installed Counterfact server did not start.\n${successProcess.output.stdout}\n${successProcess.output.stderr}`,
      );
      await sendApiRequest({
        body: JSON.stringify({ value: bodySentinel }),
        headers: {
          authorization: `Bearer ${bearerTokenSentinel}`,
          "x-private-header": headerSentinel,
        },
        path: `/wire/${requestPathSentinel}?secret=${querySentinel}`,
        port: apiPort,
      });
      await waitUntil(() => {
        const eventNames = parseCapturedEvents(capturedTelemetryBodies).map(
          ({ event }) => event,
        );

        return (
          eventNames.includes("counterfact_start_attempted") &&
          eventNames.includes("counterfact_started") &&
          eventNames.includes("first_api_request_served")
        );
      }, "The loopback collector did not receive every success lifecycle event");
      await sendApiRequest({
        body: JSON.stringify({ value: bodySentinel }),
        headers: {
          authorization: `Bearer ${bearerTokenSentinel}`,
          "x-private-header": headerSentinel,
        },
        path: `/wire/${requestPathSentinel}?secret=${querySentinel}`,
        port: apiPort,
      });
      await new Promise((resolve) => setTimeout(resolve, 750));
    } finally {
      successProcess.child.kill("SIGTERM");
      await successProcess.completed;
    }

    const successEvents = parseCapturedEvents(capturedTelemetryBodies);
    const successEventNames = successEvents.map(({ event }) => event);
    assert(successEventNames.includes("counterfact_start_attempted"));
    assert(successEventNames.includes("counterfact_started"));
    assert.equal(
      successEventNames.filter((event) => event === "first_api_request_served")
        .length,
      1,
    );
    const telemetryIdentity = await json(
      path.join(successConfigRoot, "counterfact", "telemetry.json"),
    );
    assert.match(telemetryIdentity.locationHashKey, /^[a-f0-9]{64}$/u);
    if (process.platform !== "win32") {
      const identityFile = await stat(
        path.join(successConfigRoot, "counterfact", "telemetry.json"),
      );
      assert.equal(identityFile.mode & 0o777, 0o600);
    }
    const capturedSuccessPayload = capturedTelemetryBodies.join("\n");
    for (const sentinel of [
      sourceLocationSentinel,
      requestPathSentinel,
      querySentinel,
      headerSentinel,
      bearerTokenSentinel,
      bodySentinel,
      telemetryIdentity.locationHashKey,
    ]) {
      assert(
        !capturedSuccessPayload.includes(sentinel),
        `Telemetry captured private value: ${sentinel}`,
      );
    }

    capturedTelemetryBodies.length = 0;
    const startupErrorSentinel = "private-startup-error-sentinel";
    const failureConfigRoot = path.join(temporaryRoot, "telemetry-failure");
    const failureResult = await run(
      installedBinary,
      [
        path.join(consumerDirectory, `${startupErrorSentinel}.yaml`),
        path.join(consumerDirectory, "failure-generated"),
        "--generate",
        "--no-update-check",
      ],
      {
        allowFailure: true,
        cwd: consumerDirectory,
        env: telemetryEnvironment({
          NO_COLOR: "1",
          POSTHOG_API_KEY: "wire-test-key",
          POSTHOG_HOST: telemetryHost,
          XDG_CONFIG_HOME: failureConfigRoot,
        }),
        shell: process.platform === "win32",
      },
    );
    assert.notEqual(failureResult.code, 0);
    await waitUntil(
      () =>
        parseCapturedEvents(capturedTelemetryBodies).some(
          ({ event }) => event === "counterfact_start_failed",
        ),
      "The loopback collector did not receive counterfact_start_failed",
    );
    const failureEvents = parseCapturedEvents(capturedTelemetryBodies);
    const failureEvent = failureEvents.find(
      ({ event }) => event === "counterfact_start_failed",
    );
    assert(
      failureEvent,
      `Missing counterfact_start_failed event.\nstdout:\n${failureResult.stdout}\nstderr:\n${failureResult.stderr}\ncaptured:\n${capturedTelemetryBodies.join("\n")}`,
    );
    assert.equal(failureEvent.properties.failureCategory, "initialization");
    assert(
      !capturedTelemetryBodies.join("\n").includes(startupErrorSentinel),
      "Startup telemetry captured the raw error or missing OpenAPI location",
    );

    for (const optOut of [
      { label: "CI", variables: { CI: "true" } },
      {
        label: "explicit opt-out",
        variables: { COUNTERFACT_TELEMETRY_DISABLED: "true" },
      },
    ]) {
      capturedTelemetryBodies.length = 0;
      const configRoot = path.join(
        temporaryRoot,
        `telemetry-disabled-${optOut.label.replaceAll(" ", "-")}`,
      );
      const result = await run(
        installedBinary,
        [
          path.join(consumerDirectory, "openapi.yaml"),
          path.join(
            consumerDirectory,
            `generated-${optOut.label.replaceAll(" ", "-")}`,
          ),
          "--generate",
          "--no-update-check",
        ],
        {
          cwd: consumerDirectory,
          env: telemetryEnvironment({
            ...optOut.variables,
            POSTHOG_API_KEY: "wire-test-key",
            POSTHOG_HOST: telemetryHost,
            XDG_CONFIG_HOME: configRoot,
          }),
          shell: process.platform === "win32",
        },
      );
      assert.equal(result.code, 0, `${optOut.label} CLI generation failed`);
      assert.equal(
        capturedTelemetryBodies.length,
        0,
        `${optOut.label} sent telemetry`,
      );
      await assert.rejects(
        readFile(path.join(configRoot, "counterfact", "telemetry.json")),
        { code: "ENOENT" },
      );
    }
  } finally {
    await closeServer(telemetryCollector);
  }

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

  process.stdout.write(
    updateFixtures
      ? "Updated packed-consumer compatibility fixtures.\n"
      : "Packed-consumer compatibility checks passed.\n",
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
