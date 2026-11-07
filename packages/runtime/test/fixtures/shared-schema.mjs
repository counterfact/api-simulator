import assert from "node:assert/strict";
import {
  ContextRegistry,
  Dispatcher,
  Registry,
  loadOpenApiDocument,
} from "@counterfact/runtime";

const document = await loadOpenApiDocument(process.argv[2]);
const depth = Number(process.argv[3]);
let entries = 0;
const registry = new Registry();
registry.add("/probe", {
  POST: () => {
    entries++;
    return { status: 200, body: "OK" };
  },
});
const dispatcher = new Dispatcher(registry, new ContextRegistry(), document, {
  validateRequests: true,
  validateResponses: true,
});
const send = (body) =>
  dispatcher.request({
    method: "POST",
    path: "/probe",
    headers: {
      "content-type": "application/json",
    },
    query: {},
    body,
    req: {},
  });
assert.equal((await send({})).status, 200);
assert.equal(entries, 1);
let valid = "leaf";
let invalid = 42;
for (let index = 0; index < depth; index++) {
  valid = { right: valid };
  invalid = { right: invalid };
}
assert.equal((await send(valid)).status, 200);
assert.equal(entries, 2);
assert.equal((await send(invalid)).status, 400);
assert.equal(entries, 2);
assert.equal((await send({ left: 12 })).status, 400);
assert.equal(entries, 2);
console.log("SHARED_GRAPH_VALIDATED");
