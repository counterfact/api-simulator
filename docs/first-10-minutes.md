# Your first 10 minutes with Counterfact

This guide turns the README promise into an observable workflow. By the end, you will know how to create shared state, reset it for a test, run the server without the REPL, and leave repeatable evidence for a teammate or coding agent.

## Set up once

Counterfact requires Node.js 22 or newer. This walkthrough uses Counterfact 2.14.0 and its matching Petstore document, so every path and generated type below is reproducible:

```sh
npm install --save-dev counterfact@2.14.0
curl --fail --location \
  --output openapi.yaml \
  https://raw.githubusercontent.com/counterfact/api-simulator/v2.14.0/petstore.yaml
npx counterfact ./openapi.yaml api
```

The first command pins Counterfact in `package-lock.json`. The second saves the walkthrough contract locally. The last generates editable route stubs in `api/routes/`, generated contract types in `api/types/`, and scenario scaffolding in `api/scenarios/`; it then starts a server on port 3100. Exit the REPL with `.exit`, <kbd>Ctrl</kbd>+<kbd>D</kbd>, or <kbd>Ctrl</kbd>+<kbd>C</kbd> twice.

For a disposable exploratory run, you can skip the installation and local spec:

```sh
npx counterfact@latest https://petstore3.swagger.io/api/v3/openapi.json api
```

Both paths need network access. `@latest` can change, so use the pinned local-install form for this walkthrough, committed projects, and automation.

## Build a stateful flow

**Prerequisite:** complete [Set up once](#set-up-once). This section uses the pinned Petstore contract from that setup.

Generated handlers initially return schema-derived samples. To prove why Counterfact is different from a static fixture, make two routes share state.

Create a context with an explicit baseline and reset method:

```ts
// api/routes/_.context.ts
import type { Pet } from "../types/components/schemas/Pet.js";

export class Context {
  private pets = new Map<number, Pet>();
  private nextId = 1;
  simulateFailure = false;

  reset() {
    this.pets.clear();
    this.nextId = 1;
    this.simulateFailure = false;
  }

  add(pet: Omit<Pet, "id">): Pet {
    const created = { ...pet, id: this.nextId++ };
    this.pets.set(created.id, created);
    return created;
  }

  get(id: number) {
    return this.pets.get(id);
  }
}
```

Replace the generated exports in these two handlers:

```ts
// api/routes/pet.ts
import type { addPet } from "../types/paths/pet.types.js";

export const POST: addPet = ($) => $.response[200].json($.context.add($.body));
```

```ts
// api/routes/pet/{petId}.ts
import type { getPetById } from "../../types/paths/pet/{petId}.types.js";

export const GET: getPetById = ($) => {
  if ($.context.simulateFailure) {
    return $.response[400].empty();
  }
  const pet = $.context.get($.path.petId);
  return pet ? $.response[200].json(pet) : $.response[404].empty();
};
```

Saving reloads the handlers without discarding the current context. Create a pet and read the same record on a later request:

```sh
curl -X POST http://localhost:3100/pet \
  -H 'content-type: application/json' \
  -d '{"name":"Fluffy","photoUrls":[],"status":"available"}'

curl http://localhost:3100/pet/1
```

From a browser app, point the client at the same local base URL:

```ts
const response = await fetch("http://localhost:3100/pet/1");
const pet = await response.json();
```

Counterfact sends CORS headers for local browser requests. OpenAPI security declarations expose parsed auth values to handlers but do not enforce authentication or authorization rules; add those rules in a [middleware file](./features/middleware.md) when the client workflow needs them.

That persisted record is behavior you authored. The OpenAPI-derived types check its shape when your project runs TypeScript; they do not invent the storage rule for you.

For a longer walkthrough, including delete and proxy examples, continue with [Getting Started](./getting-started.md).

## Automate a deterministic test

**Prerequisite:** complete [Set up once](#set-up-once) and [Build a stateful flow](#build-a-stateful-flow). Stop the interactive server before starting the test server below.

The interactive REPL is useful for exploration, but automation should control lifecycle and state directly. Counterfact's library API exposes the live context and returns an awaited `stop()` function.

Use Node's built-in test runner so the recipe needs no additional framework. Put the full configuration, lifecycle, bounded readiness check, and assertions in one file:

```js
// test/counterfact.test.mjs
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import path from "node:path";
import { counterfact } from "counterfact";

const config = {
  alwaysFakeOptionals: false,
  basePath: path.resolve("api"),
  buildCache: false,
  generate: { routes: false, types: false },
  openApiPath: path.resolve("openapi.yaml"),
  port: 4100,
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
      await fetch("http://localhost:4100/pet/999999");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error("Counterfact did not become ready");
}

async function addPet() {
  const response = await fetch("http://localhost:4100/pet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Fluffy",
      photoUrls: [],
      status: "available",
    }),
  });
  assert.equal(response.status, 200);
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

test("reproduces failure and successful recovery", async () => {
  assert.equal((await fetch("http://localhost:4100/pet/1")).status, 404);

  await addPet();
  const created = await fetch("http://localhost:4100/pet/1");
  assert.equal(created.status, 200);
  assert.deepEqual(await created.json(), {
    id: 1,
    name: "Fluffy",
    photoUrls: [],
    status: "available",
  });

  context.simulateFailure = true;
  assert.equal((await fetch("http://localhost:4100/pet/1")).status, 400);

  context.reset();
  assert.equal((await fetch("http://localhost:4100/pet/1")).status, 404);
  await addPet();
  const recovered = await fetch("http://localhost:4100/pet/1");
  assert.equal(recovered.status, 200);
  assert.deepEqual(await recovered.json(), {
    id: 1,
    name: "Fluffy",
    photoUrls: [],
    status: "available",
  });
});
```

Use this minimal type-check configuration for the walkthrough, or include `api/**/*.ts` in your project's existing TypeScript configuration. Save it as `tsconfig.counterfact.json`:

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "skipLibCheck": true,
    "strict": true,
    "target": "ES2022"
  },
  "include": ["api/**/*.ts"]
}
```

Run the same commands locally and in CI:

```sh
node --test test/counterfact.test.mjs
npx tsc --project tsconfig.counterfact.json
```

The test is JavaScript because Counterfact 2.14.0 does not publish a complete declaration for its library entry point. The separate TypeScript command checks the generated handlers and contract types. Counterfact executes TypeScript routes but does not run this type-check step for you.

Use a unique Counterfact instance and port per parallel test worker. There is no built-in atomic reset or automatic per-test isolation: your `reset()` method defines the baseline. A fresh process also creates fresh context, with its constructor and optional `startup` scenario establishing initial state.

For larger suites, see [Automated Integration Tests](./patterns/automated-integration-tests.md) and [Scenario Scripts](./patterns/scenario-scripts.md).

For a smaller, standalone `/pets` variant with every file checked in and a path-scoped GitHub Actions check, open the [verified first-10-minutes example](../examples/first-10-minutes/). It demonstrates the same state/failure/reset concepts with a minimal contract; its paths and generated types intentionally differ from this Petstore walkthrough.

## Give an agent a verifiable task

**Prerequisite:** give the agent the pinned setup, resettable context, and exact verification commands from the two sections above.

Give an implementation agent a bounded job with commands and durable acceptance evidence. For example:

```text
Use openapi.yaml and the generated api/types as the contract.

1. Implement the smallest context and handlers needed for POST /pet and GET /pet/{petId}.
2. Add a reset() method that restores a named baseline without random data.
3. Add a startup scenario only if the baseline needs seed data.
4. Add a real-HTTP test that proves create -> read -> forced failure -> reset -> recovery.
5. Run: node --test test/counterfact.test.mjs
6. Run the project's TypeScript check.

Do not change the OpenAPI document to make the implementation pass. Do not claim the
simulator proves production business behavior. Leave the context, handlers, and test in
the change so a human reviewer can reproduce the same API world.
```

The reviewable output is code plus a deterministic test, not a successful interactive session. Keep at least one targeted test against the real backend or an end-to-end environment so an agent cannot optimize only for simulated behavior.

See [AI-Assisted Implementation](./patterns/ai-assisted-implementation.md) for handler-generation guidance and [Hybrid Proxy](./patterns/hybrid-proxy.md) for gradually introducing real endpoints.

## Know what is guaranteed

| Mechanism                    | Reliable claim                                                                                   | Boundary you still own                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Generated handlers and types | Request/response shapes come from supported OpenAPI operations                                   | Run a TypeScript check; a running server alone does not prove the handlers compile               |
| `.random()`                  | Produces schema-derived sample data and prefers examples when present                            | It is not seeded, deterministic, or guaranteed to model business behavior                        |
| Request validation           | Detects missing required query/header/cookie parameters and validates supported JSON/form bodies | It does not enforce authentication, authorization, path schemas, or business rules               |
| Response checking            | Checks required response headers and their schema types at runtime                               | It does not validate response bodies; errors are advisory headers and the response still returns |
| Context and scenarios        | Make your authored state and startup baseline reproducible                                       | Hot reload preserves current state; reset/isolation must be explicit                             |
| Proxying                     | Lets one base URL forward selected paths upstream                                                | Forwarded behavior belongs to the upstream and bypasses local handlers and local contract checks |

## Adopt, isolate, and retire

- Commit the spec, editable route/context/scenario files, and usually generated types. Commit your package lockfile.
- Avoid random handlers in deterministic tests. Define explicit fixtures and call `reset()` in test setup.
- For parallel jobs, give each worker its own process, output directory, and port.
- With `--proxy-url`, forwarding is on by default. Use `.proxy off /payments` to make that path local, then `.proxy on /payments` to return it upstream.
- As real endpoints become available, turn their paths upstream and remove the local handlers, scenarios, and tests that no longer serve a simulation use case. When the simulator is no longer needed, remove the generated directory and development dependency in a normal reviewed change.
- Retain targeted real-backend or end-to-end coverage for authentication, authorization, side effects, performance, and business behavior.

Next: browse [Usage](./usage.md), [Patterns](./patterns/index.md), or the complete [Reference](./reference.md).
