import assert from "node:assert/strict";

import {
  ContextRegistry,
  Registry,
  ScenarioRegistry,
} from "@counterfact/runtime";

const contexts = new ContextRegistry();
contexts.add("/pets", { available: 2 });
assert.deepEqual(contexts.find("/pets/42"), { available: 2 });

const routes = new Registry();
routes.add("/pets/{petId}", { GET() {} });
assert.equal(routes.routes[0]?.path, "/pets/{petId}");

const scenarios = new ScenarioRegistry();
scenarios.add("index", { reset() {} });
assert.deepEqual(scenarios.getExportedFunctionNames("index"), ["reset"]);
