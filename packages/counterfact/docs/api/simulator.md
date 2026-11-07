# Simulator lifecycle

```ts
import { counterfact } from "counterfact";
const api = await counterfact({ basePath: "api", port: 0 });
const { stop } = await api.start();
try {
  console.log(api.status().address);
  await api.reset();
  const context = api.loadContext("/");
} finally {
  await stop();
}
```

## Construction

`counterfact<TStore>(options, specs?)` resolves to a simulator. `basePath` is required; other `Config` fields are optional. The default port is 8100, `openApiPath` is `_`, server startup is enabled, and the REPL and Admin API are disabled. Generation, specification watching, cache building, and request/response validation default to enabled. Without a specification, there is no contract to generate or validate against.

An [API group](../manual/concepts.md#api-groups-versions-and-url-prefixes) collects specs sharing route files and context/scenario state. Each entry in `specs` is a `SpecConfig` object.

Each specification entry accepts `source`, `group`, optional `version`, optional `prefix`, and optional `overlays`. Only `prefix` changes request URLs. Groups select generated directories and state; versions in a group share contexts and scenarios.

## Simulator members

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

## Startup overrides

`start(options?)` accepts partial overrides for `port`, `startServer`, `buildCache`, `generate`, and `watch`. It awaits the HTTP listener. Use `port: 0` for an OS-assigned port and read the bound address from `status()`.

Compiled cache updates are published as complete files. On Windows, startup and reload briefly retry file-sharing conflicts, including when multiple versions share a group's cache. If replacement still fails, the previous complete file remains intact and the error is reported.

## Reset and state identity

`reset()` requires a started simulator. It reconstructs the store, contexts, and route modules, then awaits startup scenarios. The HTTP listener stays bound; requests receive 503 while state is unavailable. Concurrent resets share one operation. A failed reset leaves state unavailable until a successful reset.

Reacquire contexts with `loadContext()` and read `api.store` again after reset. Previously held objects refer to the old state. Reset cannot run during a scenario; scenario calls require a running simulator and must wait for reset to finish.

## Scenario selection

`scenario(path, group?)` resolves and awaits a named scenario with the same arguments as the REPL. Select a group explicitly when several API groups exist. `loadContext(path = "/", group?)` likewise requires a group in a multi-group simulator.

See the [programmatic manual](../features/programmatic-api.md) for complete test-suite examples.

Each explicit module load or retry creates a fresh ESM module generation. Watcher refreshes reuse unchanged local modules and invalidate changed modules together with their transitive importers. A failed route evaluation or temporary syntax error does not discard successfully loaded, unrelated contexts when the error is corrected. Modules containing dynamic imports are conservatively reevaluated because their future dependencies are not yet known. Routes, contexts, scenarios, and their local ESM dependencies share that generation, so a handler's context and custom-error imports agree. Separate simulator instances construct independent contexts and can have different class definitions. Reloads preserve live context values and update methods; retained objects from an older generation are not automatically converted to new classes.

Versioned runners in the same API group share both context state and the ESM generation. Refreshing one runner refreshes its loaded siblings before reporting completion. Adding another version preserves existing live context values.

Nested user class instances (including subclasses of native containers) compare by identity, not constructor or method source. When a context is reconstructed, newly created class-backed fields replace the old instances; Counterfact does not attempt to migrate private fields, closure captures, or live mutations into them. Keep reload-persistent mutable data in plain objects, arrays, or supported native values such as Map/Set. An unchanged context graph is reused on unrelated route edits, preserving its existing instances, arrow-method receivers, and private-field brands. Direct context function fields refresh when the context module or one of its local dependencies changes. Explicit context-code reloads still cannot migrate root private fields or rebind root arrow closures on a retained context; use `reset()` to reconstruct it after changing such code. Other opaque values such as errors, promises and weak collections also compare by identity.

A direct import outside a simulator belongs to a different generation. Do not use an externally imported context or error constructor to check objects created inside the simulator with `instanceof`. Compare classes within the same generation, or use an explicit error code when values cross generations. Builtins and bare package dependencies keep their normal Node behavior; the generation guarantee applies to local ESM graphs. Watcher refreshes also preserve unchanged CommonJS contexts and invalidate tracked local CommonJS dependencies, using Node’s process-global cache. Independent CommonJS simulators loading the same files in one process are not isolated: a loader or direct `require()` can replace entries used by another. Use separate processes when that isolation is needed. Explicit CommonJS loads and arbitrary delayed `require()` calls also retain Node’s shared dependency cache behavior.

Native ESM loading uses Node module hooks. Integration tests that construct simulators or use `ModuleLoader` should run under Node's built-in `node:test` runner, or in a separate Node process. Jest's sandbox rejects these hooks; changing the assertion library does not change that limitation.

Boolean query, header, and cookie parameters accept the case-sensitive wire values true and false. With request validation enabled, malformed text returns 400 before the handler executes. With validation disabled, malformed boolean text remains unchanged instead of becoming false.
Versioned dispatchers only execute operations declared in their selected contract. An absent path returns 404; an absent method returns 405. Unversioned dispatchers continue to support custom routes.
