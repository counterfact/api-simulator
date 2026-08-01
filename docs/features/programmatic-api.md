# Programmatic API

Counterfact can be used as a library — for example, from [Playwright](https://playwright.dev/) or [Cypress](https://www.cypress.io/) tests. This lets you manipulate context state directly in test code without relying on special magic values in mock logic.

```ts
import path from "node:path";
import { counterfact } from "counterfact";

const config = {
  basePath: path.resolve("api"), // directory containing your routes/
  buildCache: false,
  openApiPath: path.resolve("api.yaml"), // pass "_" to run without a spec
  port: 8100,
  alwaysFakeOptionals: false,
  generate: { routes: false, types: false },
  proxyPaths: new Map(),
  proxyUrl: "",
  prefix: "",
  startRepl: false, // do not auto-start the REPL
  startServer: true,
  validateRequests: true,
  validateResponses: true,
  watch: { routes: false, types: false },
};

const { contextRegistry, start } = await counterfact(config);
const { stop } = await start(config);

// Get the root context — the object your routes see as $.context
const rootContext = contextRegistry.find("/");
```

Once you have `rootContext` you can read and write any state that your route handlers expose.

## Example: parameterised auth scenario with Playwright

Given this route handler:

```ts
// routes/auth/login.ts
export const POST: HTTP_POST = ($) => {
  if ($.context.passwordResponse === "ok") return $.response[200];
  if ($.context.passwordResponse === "expired")
    return $.response[403].header("reason", "expired-password");
  return $.response[401];
};
```

A Playwright test can flip between scenarios without hard-coded usernames:

```ts
import { counterfact } from "counterfact";
import { chromium } from "playwright";

let page;
let rootContext;
let stop;
let browser;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  page = await (await browser.newContext()).newPage();

  const { contextRegistry, start } = await counterfact(config);
  ({ stop } = await start(config));
  rootContext = contextRegistry.find("/");
});

afterAll(async () => {
  await stop();
  await browser.close();
});

it("rejects an incorrect password", async () => {
  rootContext.passwordResponse = "incorrect";
  await attemptToLogIn();
  expect(await page.isVisible("#authentication-error")).toBe(true);
});

it("loads the dashboard on success", async () => {
  rootContext.passwordResponse = "ok";
  await attemptToLogIn();
  expect(await page.isVisible("#dashboard")).toBe(true);
});

it("prompts for a password change when the password has expired", async () => {
  rootContext.passwordResponse = "expired";
  await attemptToLogIn();
  expect(await page.isVisible("#password-change-form")).toBe(true);
});
```

## Multiple specs / versioned APIs

Pass a `specs` array as the second argument to `counterfact()` to host several API specs on the same server. Each entry is a `SpecConfig` object:

| Field     | Type            | Description                                                                                   |
| --------- | --------------- | --------------------------------------------------------------------------------------------- |
| `source`  | `string`        | Path or URL to the OpenAPI document (`"_"` to run without a spec).                            |
| `group`   | `string`        | Generated-code subdirectory and runtime state key. It does not change URLs.                   |
| `version` | `string` (opt.) | Version label (e.g. `"v1"`) used for generated version types and grouped handler state.       |
| `prefix`  | `string` (opt.) | URL prefix prepended to every path in the spec. When omitted, it defaults to `""` (the root). |

### Groups and URL prefixes

`group` controls where code is generated under `config.basePath` and which
runners share state. It never changes a path declared by the OpenAPI document.
Only `prefix` affects the effective URL:

| Declared OpenAPI path | `prefix`        | Effective URL       |
| --------------------- | --------------- | ------------------- |
| `/customers`          | omitted or `""` | `/customers`        |
| `/customers`          | `/api`          | `/api/customers`    |
| `/customers`          | `/api/v1`       | `/api/v1/customers` |

Several specs may use the same prefix, including the root. Counterfact tries
matching runners in declaration order, so grouped specs with distinct paths
can preserve their canonical URLs:

```ts
const { start } = await counterfact(config, [
  { source: "./customers.yaml", group: "customers" },
  { source: "./products.yaml", group: "products" },
]);

await start(config);
// /customers from customers.yaml is served at /customers.
// /products from products.yaml is served at /products.
```

### Example — serving two versions of the same API

```ts
import { counterfact } from "counterfact";

const { start } = await counterfact(config, [
  {
    source: "./api-v1.yaml",
    group: "my-api",
    version: "v1",
    prefix: "/api/v1",
  },
  {
    source: "./api-v2.yaml",
    group: "my-api",
    version: "v2",
    prefix: "/api/v2",
  },
]);

await start(config);
// Routes are now available at:
//   http://localhost:8100/api/v1/...
//   http://localhost:8100/api/v2/...
```

Use any explicit prefix that matches the API's public URL structure:

```ts
const { start } = await counterfact(config, [
  { source: "./api.yaml", group: "my-api", version: "v1", prefix: "/legacy" },
]);
// Routes are served at /legacy/...; group/version still control code and state.
```

## Return value of `counterfact()`

| Property          | Type                           | Description                                                                                                                  |
| ----------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `contextRegistry` | `ContextRegistry`              | Registry of all context objects keyed by path. Call `.find(path)` to get the context for a given route prefix.               |
| `registry`        | `Registry`                     | Registry of all loaded route modules.                                                                                        |
| `koaApp`          | `Koa`                          | The underlying Koa application.                                                                                              |
| `start(config)`   | `async (config) => { stop() }` | Starts the server (and optionally the file watcher and code generator). Returns a `stop()` function to gracefully shut down. |
| `startRepl()`     | `() => REPLServer`             | Starts the interactive REPL. Returns the REPL server instance.                                                               |

## See also

- [State](./state.md) — the context objects you manipulate from test code
- [Patterns: Automated Integration Tests](../patterns/automated-integration-tests.md) — using the programmatic API in a CI-friendly test suite
- [Reference](../reference.md) — CLI flags, architecture
- [Usage](../usage.md)
