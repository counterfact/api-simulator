import assert from "node:assert/strict";

import { createOpenApiRouteCatalog } from "@counterfact/client";
import { createCompleter } from "@counterfact/repl";

const catalog = createOpenApiRouteCatalog({
  paths: { "/pets/{petId}": { get: {} } },
});
const completer = createCompleter({ routes: [] }, undefined, catalog);

const completion = await new Promise((resolve, reject) => {
  completer('route("/pe', (error, result) => {
    if (error) reject(error);
    else resolve(result);
  });
});

assert.deepEqual(completion, [["/pets/{petId}"], "/pe"]);
