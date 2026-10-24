# Programmatic API

Follow the [project installation setup](../patterns/lifecycle-setup.md) to install a pinned dependency and verify the lifecycle API.

Counterfact can be used as a library — for example, from [Playwright](https://playwright.dev/) or [Cypress](https://www.cypress.io/) tests. This lets you manipulate context state directly in test code without relying on special magic values in mock logic.

Point Counterfact at an API directory, then start it:

```ts
import { counterfact } from "counterfact";

const api = await counterfact({ basePath: "api" });
const { stop } = await api.start();

// The same live context your routes see as $.context
const rootContext = api.loadContext("/");

// When the test suite finishes
await stop();
```

`basePath` is the only required option and can be relative to the current working
directory. Missing API, route, and required cache directories are created
automatically; an empty API starts successfully and returns 404 until routes are
added. By default, Counterfact serves existing routes on port **8100** without
loading an OpenAPI spec, starting a REPL, or enabling the Admin API. Runtime hot reload stays active until you call `stop()`.

Pass only the options you need to change:

```ts
const api = await counterfact({
  basePath: "api",
  openApiPath: "openapi.yaml", // generates routes/types and watches this spec
  port: 4001,
});
const { stop } = await api.start();
```

Generation, watching, and cache building are enabled by default, with or without
a spec. Supplying `openApiPath` generates routes and types at startup, watches
for spec changes, and enables spec-backed validation. Without a spec, there
are no spec-driven routes or types to generate. Generated handlers that use
`$.response.status(status).random()` or `.example(name)` require a supplied spec;
without it, the response definition is unavailable. To opt out, pass
`generate: { routes: false, types: false }`,
`watch: { routes: false, types: false }`, or `buildCache: false`.
`watch` controls regeneration; it does not disable runtime hot reload. Other runtime
options remain available as overrides. Each simulator gets its own proxy map. `buildCache` enables a one-time cache
build when `startServer` is false; a running server compiles and reloads routes
as needed regardless of that flag.

`start()` reuses the configuration passed to `counterfact()`. Pass partial
startup overrides to change the port or startup controls while retaining defaults:

```ts
const { stop } = await api.start({ port: 8111 });
console.log(api.status().address?.port); // 8111
```

`port`, `startServer`, `buildCache`, `generate`, and `watch` can be overridden.
Existing calls that pass a full configuration to `counterfact(config)` and `start(config)` remain
supported. In the examples below, `config` can be a minimal object such as
`{ basePath: "api" }`.

Once you have `rootContext` you can read and write any state that your route handlers expose.

## Checking server status

Call `api.status()` for the resolved API directory and a snapshot of the HTTP listener:

```ts
const api = await counterfact({ basePath: "api", port: 0 });
api.status().basePath; // "/absolute/path/to/api"
api.status().listening; // false

const { stop } = await api.start();
const status = api.status();
if (status.listening && status.address) {
  console.log(`Counterfact is listening on port ${status.address.port}`);
}

await stop();
api.status().basePath; // "/absolute/path/to/api"
api.status().listening; // false
```

`basePath` is the absolute API directory containing `routes/`, resolved relative
to the working directory when `counterfact()` is called. It remains available
before startup, after shutdown, and when the HTTP server is disabled.

The snapshot also includes resolved configuration: `port`, `openApiPath`,
`prefix`, `generate`, `watch`, `buildCache`, server/REPL/Admin API flags,
validation settings, overlays, and proxy settings. Explicit startup options are
reflected after calling `start(options)`. The configured `port` can be `0`;
`address.port` is the actual allocated port. The Admin API token is omitted.
Objects, arrays, and maps are copied so editing a snapshot does not change the
simulator's configuration.

`address` contains the bound address, address family, and actual port, including
an automatically assigned port when configured with `port: 0`. `start()` waits
until the listener is ready and rejects if binding fails, such as when the port
is already occupied. With `startServer: false`, `listening` remains `false` and
`address` remains `null`. This reports the local HTTP listener;
it does not probe application routes or upstream services.

## Accessing an application-level store

If `<basePath>/_.store.ts` exists, `counterfact()` constructs one shared store
for the simulator and exposes it through the optional `store` property. Supply
the user-authored store type as the generic argument when you want typed access:

```ts
import { counterfact } from "counterfact";
import type { Store } from "./api/_.store.js";

const simulator = await counterfact<Store>(config, specs);

if (simulator.store === undefined) {
  throw new Error("Expected api/_.store.ts to be loaded");
}

simulator.store.seed();
const { stop } = await simulator.start();
```

The property remains optional because the published API cannot infer whether a
caller-local file exists. The object is the same live store used by every API
group's context constructors and by the REPL. It is available before `start()`
when discovered during simulator construction.

## Resetting a running simulator

```ts
const simulator = await counterfact({ basePath: "api" });
const { stop } = await simulator.start();
try {
  await simulator.reset();
  await simulator.scenario("emptyProjects");
  await simulator.scenario("pets/orders/pending");
  const currentContext = simulator.loadContext("/");
} finally {
  await stop();
}
```

`reset(): Promise<void>` reconstructs application state from the currently loaded
code and configuration. It constructs a new application store, reconstructs all
source-defined contexts (including nested contexts and dependencies resolved by
`loadContext`), restores source routes and middleware, and awaits `startup` from
`scenarios/index.ts`. With multiple API groups, startup runs once per group in
specification declaration order; versions in a group share contexts. All groups
receive the same newly constructed store.

Dynamically added properties, records, contexts, handler overrides, and named
builders in `$.routes` disappear. Deleted baseline data returns. Startup can add
its own baseline data and named builders again. Reset does not merge defaults,
clone application objects, regenerate files, reimport modules, or restart the
listener. Constructors run normally, preserving class behavior and shared
references. Missing optional store, context, and startup files remain supported.

Hot reload retains its existing state-preserving behavior. Reset uses the last
successfully loaded store/context constructors and currently loaded scenarios,
including accepted hot reloads. File events received during reset wait until it
finishes. Configuration such as routing prefixes, validation and proxy settings
is preserved. Reset cannot undo external database writes, timers/background jobs,
module-level singleton mutations, or other side effects outside managed stores
and contexts. Put resettable application state in constructors and startup.

### Reference lifetime

Every successful reset replaces context and store identities. Previously saved
references continue to point to the old objects and must be discarded. Reacquire
`simulator.store` and `simulator.loadContext(path, group?)` after awaiting reset.
Existing `contextRegistry` and `registry` handles retain their identities; the
exposed registries refer to the primary API group. `loadContext` requires a group
when multiple groups are configured. The built-in REPL's `context`, `store`, and
`routes` globals are refreshed after successful reset. Copies saved in other REPL
variables are still stale.

Public `store` and `loadContext()` access throws during reset and after reset
failure, including when shutdown is waiting for reset to settle. The low-level registries and externally held references bypass this
protection; callers must avoid reading or mutating those during lifecycle work.

### Concurrency and failures

- Reset requires a successful `start({ startServer: true, ... })`. Overlapping
  `reset()` calls share the same promise and reconstruct state once.
- Requests already accepted finish before reconstruction begins, including
  asynchronous handlers, streamed responses, and producer cleanup after a client
  disconnect. A handler or stream that never
  finishes can keep reset pending; stop its producer before awaiting reset.
- Requests arriving during reset receive HTTP **503** immediately. They are not
  queued or replayed. The listener stays on the same port.
- Reset resolves only after all startup scenarios finish. Startup runs without
  application HTTP access: the listener is gated during reset, just as initial
  startup runs before listening. Seed state directly through scenario arguments.
- Public `scenario()` calls reject while resetting, after failure, or after stop.
  Only one public scenario may run at once; reset rejects while a scenario runs.
  Scenario execution otherwise leaves HTTP available, matching interactive REPL
  use. Quiesce test traffic before applying scenarios for deterministic setup.
- A constructor, context dependency cycle, or startup failure rejects reset with
  its cause. Startup failures identify the API group. HTTP stays at **503** until
  a subsequent reset succeeds. Fix the underlying problem (hot reload continues
  to work), retry reset, or stop the simulator. Partial initialization is never
  silently made available to HTTP clients.
- Scenario lookup and execution errors reject `scenario()`; scenario mutations
  are not rolled back. Reset before continuing if a scenario failed partway.
- `stop()` waits for an active reset/scenario, then closes the listener and
  watchers, even after reset failure. Do not call lifecycle methods from inside
  handlers or scenarios; waiting for their own completion would deadlock. Direct
  REPL or low-level registry mutation must be serialized by the caller.

### Invoking named scenarios

`scenario(path: string, group?: string): Promise<void>` uses the REPL's path
resolver and supplies `{ context, loadContext, route, routes }` automatically.
It awaits asynchronous scenarios and propagates errors. A bare name selects an
export from `scenarios/index.ts`; `pets/orders/pending` selects `pending` from
`scenarios/pets/orders.ts`. Empty paths and `.`/`..` segments reject. A missing
file or non-function export produces a descriptive error. No extra user arguments
are supported, matching the REPL; use a named wrapper for parameterized helpers.
Scenarios normally transform live state; reset is the explicit fresh baseline.
With `port: 0`, `start()` awaits the OS-assigned listening address. Scenario
requests use that actual port, including named builders saved by startup before
the listener was bound and builders recreated during reset.

With multiple groups, select the group separately so scenario paths stay
unambiguous:

```ts
await simulator.reset(); // all groups, once each
await simulator.scenario("pets/orders/pending", "pets");
const pets = simulator.loadContext("/", "pets");
```

When several versions belong to one group, scenario execution uses that group's
first declared runner, as startup does, with its route catalog. `route()` retains
the REPL's URL behavior: supply the effective request path, including any prefix.

For worker-scoped Playwright startup, automatic per-test reset, optional scenario
selection, and HTTP assertions, see the runnable
[Playwright example](https://github.com/counterfact/api-simulator/blob/0e4f31b8ccb827036085b452d8e18a76236a029a/examples/playwright-reset/README.md) and
[Automated Integration Tests](../patterns/automated-integration-tests.md).

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

await start();
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

await start();
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

| Property                     | Type                                 | Description                                                                                                                     |
| ---------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `contextRegistry`            | `ContextRegistry`                    | Registry of all context objects keyed by path. Call `.find(path)` to get the context for a given route prefix.                  |
| `registry`                   | `Registry`                           | Registry of all loaded route modules.                                                                                           |
| `koaApp`                     | `Koa`                                | The underlying Koa application.                                                                                                 |
| `store`                      | `TStore \| undefined`                | Optional application-level store loaded from `<basePath>/_.store.ts`. Supply `TStore` to `counterfact<TStore>()`.               |
| `start(options?)`            | `async (options?) => { stop() }`     | Merges partial startup overrides into the initial configuration and waits for the listener. Returns an awaited `stop()` handle. |
| `reset()`                    | `() => Promise<void>`                | Reconstructs managed application state and awaits startup without restarting HTTP.                                              |
| `scenario(path, group?)`     | `(string, string?) => Promise<void>` | Resolves and awaits a named scenario, supplying the REPL arguments.                                                             |
| `loadContext(path?, group?)` | `(string?, string?) => Context`      | Gets the current context; reacquire after reset.                                                                                |
| `startRepl()`                | `() => REPLServer`                   | Starts the interactive REPL. Returns the REPL server instance.                                                                  |
| `status()`                   | `() => CounterfactStatus`            | Returns the absolute API directory, current HTTP listening state, and bound address.                                            |

## See also

- [State](./state.md) — the context objects you manipulate from test code
- [Patterns: Share State Across API Groups](../patterns/shared-store.md) — typed shared state for multi-API simulations
- [Patterns: Automated Integration Tests](../patterns/automated-integration-tests.md) — using the programmatic API in a CI-friendly test suite
- [Reference](../api.md) — CLI flags, architecture
- [Find your workflow](../usage.md)
