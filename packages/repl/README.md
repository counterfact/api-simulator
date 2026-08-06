# `@counterfact/repl`

Counterfact's interactive Node.js REPL integration. It accepts narrow runtime
registries and a client route catalog, so applications can embed the terminal
experience without importing Counterfact's CLI or telemetry policy.

The package is private while its direct-consumer API is stabilized.

## Starting a REPL

```js
import { createOpenApiRouteCatalog } from "@counterfact/client";
import {
  ContextRegistry,
  Registry,
  ScenarioRegistry,
} from "@counterfact/runtime";
import { startRepl } from "@counterfact/repl";

const contextRegistry = new ContextRegistry();
const registry = new Registry();
const scenarioRegistry = new ScenarioRegistry();
const config = { port: 3000, proxyPaths: new Map(), proxyUrl: "" };
const routeCatalog = createOpenApiRouteCatalog({ paths: {} });

const replServer = startRepl(
  contextRegistry,
  registry,
  config,
  undefined,
  routeCatalog,
  scenarioRegistry,
  undefined,
  undefined,
  (event) => console.log(event),
);
```

The optional event reporter receives command names but never command arguments.
Reporter failures are ignored so observability cannot interrupt an interactive
session.

## REPL globals

The REPL starts with these live values:

- `context` and `loadContext(path)` expose runtime state.
- `client` is an `@counterfact/client` `RawHttpClient` configured for the
  simulator.
- `route(path)` creates an immutable request builder.
- `routes` is shared with scenario functions.
- `store` is present when the simulator has a shared store.

For multiple APIs, `context`, `loadContext`, `route`, and `routes` are grouped
by API name. The `.proxy` command changes live proxy configuration and
`.scenario` applies named scenario functions.
