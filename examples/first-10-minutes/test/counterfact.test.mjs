import assert from "node:assert/strict";
import { createServer } from "node:http";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { counterfact } from "counterfact";

const port = 4100;
const baseUrl = `http://localhost:${port}`;
const upstreamPort = 4101;
const upstreamUrl = `http://127.0.0.1:${upstreamPort}`;
const config = {
  alwaysFakeOptionals: false,
  basePath: path.resolve("api"),
  buildCache: false,
  generate: { routes: false, types: false },
  openApiPath: path.resolve("openapi.yaml"),
  port,
  prefix: "",
  proxyPaths: new Map([
    ["", true],
    ["/pets", false],
  ]),
  proxyUrl: upstreamUrl,
  startRepl: false,
  startServer: true,
  validateRequests: true,
  validateResponses: true,
  watch: { routes: false, types: false },
};

let context;
let stop;
let upstream;

async function waitUntilReady() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await fetch(`${baseUrl}/pets/999999`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error("Counterfact did not become ready");
}

async function createPet(name) {
  const response = await fetch(`${baseUrl}/pets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, status: "available" }),
  });
  assert.equal(response.status, 201);
  return response.json();
}

async function readPet(id) {
  return fetch(`${baseUrl}/pets/${id}`);
}

before(async () => {
  upstream = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, {
        "content-type": "application/json",
        "x-example-upstream": "true",
      });
      response.end(JSON.stringify({ source: "upstream" }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => upstream.listen(upstreamPort, resolve));

  const app = await counterfact(config);
  ({ stop } = await app.start(config));
  context = app.contextRegistry.find("/");
  await waitUntilReady();
});

beforeEach(() => context.reset());
after(async () => {
  if (stop) await stop();
  if (upstream) await new Promise((resolve) => upstream.close(resolve));
});

test("serves local and upstream paths through one base URL", async () => {
  assert.equal((await readPet(1)).status, 404, "/pets stays local");

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("x-example-upstream"), "true");
  assert.deepEqual(await health.json(), { source: "upstream" });
});

test("proves empty, create/read, failure, reset, and recovery", async () => {
  assert.equal((await readPet(1)).status, 404, "baseline is empty");

  assert.deepEqual(await createPet("Fluffy"), {
    id: 1,
    name: "Fluffy",
    status: "available",
  });
  const created = await readPet(1);
  assert.equal(created.status, 200);
  assert.deepEqual(await created.json(), {
    id: 1,
    name: "Fluffy",
    status: "available",
  });

  context.simulateFailure = true;
  assert.equal((await readPet(1)).status, 503, "failure is explicit");

  context.reset();
  assert.equal((await readPet(1)).status, 404, "reset restores empty state");

  await createPet("Rex");
  const recovered = await readPet(1);
  assert.equal(recovered.status, 200);
  assert.deepEqual(await recovered.json(), {
    id: 1,
    name: "Rex",
    status: "available",
  });
});
