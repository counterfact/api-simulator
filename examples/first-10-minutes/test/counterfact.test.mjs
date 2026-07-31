import assert from "node:assert/strict";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { counterfact } from "counterfact";

const port = 4100;
const baseUrl = `http://localhost:${port}`;
const config = {
  alwaysFakeOptionals: false,
  basePath: path.resolve("api"),
  buildCache: false,
  generate: { routes: false, types: false },
  openApiPath: path.resolve("openapi.yaml"),
  port,
  prefix: "",
  proxyPaths: new Map(),
  proxyUrl: "",
  startRepl: false,
  startServer: true,
  validateRequests: true,
  validateResponses: true,
  watch: { routes: false, types: false },
};

let context;
let stop;

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
  const app = await counterfact(config);
  ({ stop } = await app.start(config));
  context = app.contextRegistry.find("/");
  await waitUntilReady();
});

beforeEach(() => context.reset());
after(async () => {
  if (stop) await stop();
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
