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

## Reset and state identity

`reset()` requires a started simulator. It reconstructs the store, contexts, and route modules, then awaits startup scenarios. The HTTP listener stays bound; requests receive 503 while state is unavailable. Concurrent resets share one operation. A failed reset leaves state unavailable until a successful reset.

Reacquire contexts with `loadContext()` and read `api.store` again after reset. Previously held objects refer to the old state. Reset cannot run during a scenario; scenario calls require a running simulator and must wait for reset to finish.

## Scenario selection

`scenario(path, group?)` resolves and awaits a named scenario with the same arguments as the REPL. Select a group explicitly when several API groups exist. `loadContext(path = "/", group?)` likewise requires a group in a multi-group simulator.

See the [programmatic manual](../features/programmatic-api.md) for complete test-suite examples.
