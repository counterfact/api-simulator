# @counterfact/playwright

Run one Counterfact API simulator per Playwright worker, with fresh application
state before every test. Requires Node.js 22.22 or later and Playwright Test 1.39 or
later (1.x). This is an ESM package; set `"type": "module"` in your project's
`package.json`, or use `.mts` for your Playwright configuration and fixtures.

```sh
npm install --save-dev @counterfact/playwright @playwright/test
```

`counterfact` is a dependency of this adapter. Installing Counterfact alone does
not install Playwright.

Create `fixtures.ts` alongside a self-contained `api/` directory containing your
Counterfact routes, contexts, store, scenarios, and local helpers:

```ts
import { createCounterfactTest, expect } from "@counterfact/playwright";

export const test = createCounterfactTest({ basePath: "./api" });
export { expect };
```

`basePath` resolves relative to the process working directory when the factory
is called. To resolve relative to the fixture file instead, pass an absolute
path using `fileURLToPath(new URL("./api", import.meta.url))`.

```ts
import { test, expect } from "./fixtures.js";

test("starts from baseline state", async ({ request, simulatorURL }) => {
  const response = await request.get(`${simulatorURL}/projects`);
  expect(response.status()).toBe(200);
});

test.describe("empty projects", () => {
  test.use({ scenarioName: "emptyProjects" });

  test("starts from the scenario", async ({ request, simulatorURL }) => {
    expect(
      await (await request.get(`${simulatorURL}/projects`)).json(),
    ).toEqual([]);
  });
});

test("can manipulate live state", async ({ simulator }) => {
  const context = simulator.loadContext("/");
  // Mutate your application's context or simulator.store here.
  await simulator.scenario("emptyProjects");
});
```

The automatic `simulator` fixture awaits `reset()`, then awaits the selected
scenario, before test hooks and the test run, even when the test only requests
`request` and `simulatorURL`. `scenarioName` defaults to `undefined` and has test
scope. Changing it with `test.use()` preserves worker resources. An invalid
scenario fails setup and prevents the test body from running.

## Compose with an existing test

```ts
import { test as base } from "@playwright/test";
import { createCounterfactTest } from "@counterfact/playwright";

const authenticated = base.extend<{ token: string }>({ token: "test-token" });
export const test = createCounterfactTest({ basePath: "./api" }, authenticated);

test("retains existing fixtures", async ({ token, simulatorURL }) => {
  // Both fixtures retain their types and normal Playwright lifecycle.
});
```

The factory uses Playwright's `mergeTests()`; existing test and worker fixtures
are preserved. Reserve `simulator`, `workerSimulator`, `simulatorURL`, and
`scenarioName` for this adapter. Extend the returned test when adding fixtures
that depend on these names. Such test fixtures should depend on `simulator`
when they need completed reset/scenario setup. Existing automatic fixtures that
need API state should likewise be added after creating the Counterfact test.

## Lifecycle and isolation

Each worker copies the API source into a unique temporary directory, excluding
`.cache` and `node_modules`. Nested files and symlinked source files are copied;
new compiled caches belong to that worker. Installed runtime dependencies are
resolved through links to each `node_modules` directory at or above the source,
preserving nearest-first lookup for local and hoisted dependencies. Enclosing
package module types and nested package scopes are preserved for JavaScript
routes and scenarios. Keep relative runtime imports inside `basePath`, and use a conventional
`node_modules` install. The adapter does not generate routes from an OpenAPI
spec; prepare the API directory before running tests.

A worker calls `counterfact({ basePath: isolatedPath, port: 0 })` and `start()`
once. The OS assigns the port; `simulatorURL` comes from the actual address in
`status()`. Tests within a worker execute sequentially; parallel workers have
separate listeners, stores, contexts, sources, and caches. The worker fixture
awaits server/watcher shutdown and removes its temporary directory in `finally`
blocks, including when a test, reset, or scenario fails. Startup failure also
removes the temporary copy.

`simulator` is the live public Counterfact handle. Reacquire store and context
references after any explicit reset. `workerSimulator` is also exposed for
worker fixture composition, but worker fixtures run before per-test reset and
must not retain references to resettable state. Do not stop the simulator from
a test; the adapter owns its lifetime.

Reset does not undo external database changes, module-level singleton mutations,
or background jobs. Runtime dependencies are shared code. Put mutable test state
in Counterfact stores and contexts. Playwright replaces workers after failures;
the next worker gets a fresh copy and listener. Normal fixture teardown is
covered; forcibly killing the process can leave temporary files behind.
