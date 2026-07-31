# Automated Integration Tests

You have a client application or SDK and want to write automated integration tests that make real HTTP requests against a controlled mock server.

## Problem

Unit tests that mock HTTP calls at the library boundary (using `jest.mock()`, `vi.mock()`, or a fetch interceptor) do not exercise real HTTP behavior — headers, routing, content negotiation, middleware, or status code handling. Running tests against a real backend is slower, requires infrastructure, and produces non-deterministic results.

## Solution

Use Counterfact's programmatic API to embed the mock server directly in your test suite. Start it in a `beforeAll` hook, run every test against it, and stop it in `afterAll`. The server is entirely local, so tests are fast and deterministic. Handler files control exactly what the mock returns for each test scenario.

## Example

Install Counterfact as a dev dependency and generate route files from your spec:

```sh
npm install --save-dev counterfact
npx counterfact openapi.yaml api --generate
```

Start and stop the server around your test suite:

```ts
import path from "node:path";
import { counterfact } from "counterfact";

const port = 4001;
let stop: () => Promise<void>;

const config = {
  alwaysFakeOptionals: false,
  openApiPath: path.resolve("openapi.yaml"),
  basePath: path.resolve("api"),
  buildCache: false,
  port,
  prefix: "",
  proxyPaths: new Map(),
  proxyUrl: "",
  startRepl: false,
  startServer: true,
  validateRequests: true,
  validateResponses: true,
  generate: { routes: false, types: false },
  watch: { routes: false, types: false },
};

beforeAll(async () => {
  const app = await counterfact(config);
  ({ stop } = await app.start(config));
});

afterAll(async () => {
  await stop();
});
```

Write tests that send real HTTP requests to the running server:

```ts
it("returns 200 and a pet when the pet exists", async () => {
  const response = await fetch(`http://localhost:${port}/pet/1`);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty("id");
});

it("returns 404 when the pet does not exist", async () => {
  const response = await fetch(`http://localhost:${port}/pet/99999`);
  expect(response.status).toBe(404);
});
```

To control exactly what a handler returns for a specific test, use a context flag:

```ts
// api/routes/_.context.ts
export class Context {
  simulatePetNotFound = false;
}
```

```ts
// api/routes/pet/{petId}.ts
export const GET: HTTP_GET = ($) => {
  if ($.context.simulatePetNotFound) {
    return $.response[404].text("Not found");
  }
  return $.response[200].json({
    id: $.path.petId,
    name: "Fluffy",
    status: "available",
  });
};
```

Reach into the live context via the `contextRegistry` returned by `counterfact()` to toggle behavior per test:

```ts
import path from "node:path";
import { counterfact } from "counterfact";

const port = 4001;
let contextRegistry: Awaited<ReturnType<typeof counterfact>>["contextRegistry"];
let stop: () => Promise<void>;

const config = {
  alwaysFakeOptionals: false,
  openApiPath: path.resolve("openapi.yaml"),
  basePath: path.resolve("api"),
  buildCache: false,
  port,
  prefix: "",
  proxyPaths: new Map(),
  proxyUrl: "",
  startRepl: false,
  startServer: true,
  validateRequests: true,
  validateResponses: true,
  generate: { routes: false, types: false },
  watch: { routes: false, types: false },
};

beforeAll(async () => {
  const app = await counterfact(config);
  contextRegistry = app.contextRegistry;
  ({ stop } = await app.start(config));
});

afterAll(async () => {
  await stop();
});

it("returns 404 when the flag is set", async () => {
  contextRegistry.find("/").simulatePetNotFound = true;
  const response = await fetch(`http://localhost:${port}/pet/1`);
  expect(response.status).toBe(404);
  contextRegistry.find("/").simulatePetNotFound = false;
});
```

## Consequences

- Tests send real HTTP requests, so they exercise routing, middleware, headers, and content negotiation — not just handler logic.
- The server starts and stops once per suite, keeping test overhead low even with many test cases.
- Context flags make it easy to test error branches without writing a separate handler file per scenario.
- Handler files remain the single source of truth for mock behavior; the test suite does not need to duplicate response logic.

## Related Patterns

- [Simulate Failures and Edge Cases](./simulate-failures.md) — the context-flag technique for toggling error conditions
- [Test the Context, Not the Handlers](./test-context-not-handlers.md) — unit-test context logic independently of the HTTP layer
- [Mock APIs with Dummy Data](./mock-with-dummy-data.md) — shape the responses the integration tests assert against
