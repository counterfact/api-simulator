import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDirectory, "../..");

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
  path.join(tmpdir(), "counterfact-client-consumer-"),
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

  const clientTarball = await pack(
    packageRoot,
    tarballDirectory,
    cacheDirectory,
  );

  await writeFile(
    path.join(consumerDirectory, "package.json"),
    `${JSON.stringify({ name: "client-consumer", private: true, type: "module" }, undefined, 2)}\n`,
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
      clientTarball,
    ],
    consumerDirectory,
  );

  await writeFile(
    path.join(consumerDirectory, "consume.mjs"),
    `import assert from "node:assert/strict";
import http from "node:http";
import { createOpenApiRouteCatalog, createRouteFunction } from "@counterfact/client";

let captured;
const server = http.createServer((request, response) => {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    captured = { body, headers: request.headers, method: request.method, url: request.url };
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ accepted: true }));
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
  const address = server.address();
  assert(address && typeof address !== "string");
  const catalog = createOpenApiRouteCatalog({
    paths: {
      "/pets/{petId}": {
        post: {
          summary: "Update a pet",
          parameters: [
            { in: "path", name: "petId", required: true, type: "integer" },
            { in: "query", name: "notify", required: true, type: "boolean" },
          ],
          responses: { "200": { description: "Accepted" } },
        },
      },
    },
  });
  const route = createRouteFunction(address.port, "127.0.0.1", catalog);
  const base = route("/pets/{petId}").method("post");
  assert.equal(base.ready(), false);
  assert.deepEqual(base.missing()?.path?.map(({ name }) => name), ["petId"]);

  const request = base
    .path({ petId: 42 })
    .query({ notify: true })
    .headers({ "X-Consumer": "packed" })
    .body({ status: "sold" });
  assert.equal(request.ready(), true);
  const helpOutput = [];
  const originalLog = console.log;
  console.log = (message) => helpOutput.push(String(message));
  try {
    assert.equal(request.help(), undefined);
  } finally {
    console.log = originalLog;
  }
  assert.match(helpOutput.join("\\n"), /Update a pet/);

  const rawResponse = await request.send();
  assert(rawResponse.includes("HTTP/1.1 200 OK"));
  assert.match(rawResponse, /"accepted":true/);
  assert.deepEqual(captured, {
    body: '{"status":"sold"}',
    headers: {
      connection: "close",
      "content-length": "17",
      "content-type": "application/json",
      host: "127.0.0.1",
      "x-consumer": "packed",
    },
    method: "POST",
    url: "/pets/42?notify=true",
  });
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
`,
  );

  const result = await run(
    executable("node"),
    ["consume.mjs"],
    consumerDirectory,
  );
  assert.match(result.stdout, /REQUEST #1/);
  assert.match(result.stdout, /RESPONSE #1/);

  process.stdout.write("Packed @counterfact/client consumer passed.\n");
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
