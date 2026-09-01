import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";

import { counterfact } from "counterfact";

process.env.COUNTERFACT_TELEMETRY_DISABLED = "true";
process.env.CHOKIDAR_USEPOLLING = "1";

const port = 4310;
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

let stop;

before(async () => {
  const app = await counterfact(config);
  ({ stop } = await app.start(config));
});

after(async () => stop?.());

test("serves the profile used by the React screen", async () => {
  const response = await fetch(`http://localhost:${port}/profiles/1`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: 1,
    name: "Ada Lovelace",
    role: "Frontend engineer",
  });
});

test("serves the missing-profile edge case", async () => {
  const response = await fetch(`http://localhost:${port}/profiles/2`);
  assert.equal(response.status, 404);
});
