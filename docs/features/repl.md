# REPL ⬣

The REPL is a JavaScript prompt connected directly to the running server — like the browser DevTools console, but for your mock API. After starting Counterfact you'll see:

```
____ ____ _  _ _ _ ___ ____ ____ ____ ____ ____ ___
|___ [__] |__| |\|  |  |=== |--< |--- |--| |___  |
            Storybook for the back-end

| API Base URL  ==> http://localhost:3100
| Admin Console ==> http://localhost:3100/counterfact/

⬣>
```

At the prompt you can interact with the live context:

```js
// add a single pet
context.addPet({ name: "Fluffy", photoUrls: [] });

// add 100 pets
for (let i = 0; i < 100; i++)
  context.addPet({ name: `Pet ${i}`, photoUrls: [] });

// query state
context.pets.filter((pet) => pet.name.startsWith("F"));
```

To access context from a subdirectory:

```js
const petsContext = loadContext("/pets");
```

When running multiple APIs in one process, REPL state is grouped by API key:

```js
context.billing
context.inventory
routes.billing
routes.inventory
```

In this mode, `loadContext` and `route` are also grouped by API key:

```js
loadContext.billing("/pets")
route.inventory("/stock/{sku}")
```

When configuring multiple APIs, each API must define a non-empty, unique group name.

The built-in `client` object lets you make HTTP requests from the prompt without leaving the terminal:

```js
client.get("/users");
client.post("/users", { name: "bob" });
client.put("/users/1", { name: "robert" }, { "x-api-version": "2" });
```

All standard HTTP methods are supported. Arguments are: path, body (where applicable), headers.

When an OpenAPI document is loaded, pressing Tab while typing `client.get("...` or `route("...` autocompletes using OpenAPI path templates (for example, `/example/hello/{name}`).

The built-in `route()` function creates a fluent request builder that validates required parameters against your OpenAPI document before sending:

```js
// Build and inspect before sending
const req = route("/pet/{petId}").method("get").path({ petId: 42 })
req.ready()    // true / false
req.missing()  // lists missing required parameters
req.help()     // prints OpenAPI docs for the operation
await req.send()
```

See the [Route Builder guide](./route-builder.md) for full documentation.

## Scenario scripts with `.scenario`

For more complex setups you can automate REPL interactions by writing _scenario scripts_ — plain TypeScript files that export named functions. Run them with `.scenario`:

```
⬣> .scenario soldPets
```

When running multiple APIs in one process, qualify the command with the API group:

```bash
⬣> .scenario billing soldPets
```

Tab completion supports both modes: in single-API sessions, `.scenario <Tab>` suggests scenario paths/functions; in multi-API sessions, `.scenario <Tab>` suggests API groups first, then `.scenario <group> <Tab>` suggests scenario paths/functions for that group.

**Path resolution:** the argument to `.scenario` is a slash-separated path. The last segment is the function name; everything before it is the file path, resolved relative to `<basePath>/scenarios/` (with `index.ts` as the default file).

| Command | File | Function |
|---|---|---|
| `.scenario soldPets` | `scenarios/index.ts` | `soldPets` |
| `.scenario pets/resetAll` | `scenarios/pets.ts` | `resetAll` |
| `.scenario pets/orders/pending` | `scenarios/pets/orders.ts` | `pending` |

**Version-scoped directories:** when a spec has a non-empty `version`, scenario files are resolved from two directories in order of precedence:

1. `<basePath>/<group>/<version>/scenarios/` — version-specific (searched first)
2. `<basePath>/<group>/scenarios/` — shared fallback

Files present in both directories use the version-specific copy. Files only in the shared directory are still available to all versions.

A scenario function receives a single argument with `{ context, loadContext, routes, route }`:

```ts
// scenarios/index.ts
import type { Scenario } from "../types/_.context.js";

export const soldPets: Scenario = ($) => {
  // Mutate context directly — same as typing in the REPL
  $.context.petService.reset();
  $.context.petService.addPet({ id: 1, status: "sold" });
  $.context.petService.addPet({ id: 2, status: "available" });

  // Store a pre-configured route builder for later use in the REPL
  $.routes.findSold = $
    .route("/pet/findByStatus")
    .method("get")
    .query({ status: "sold" });
}
```

After the command runs you can immediately use anything stored in `$.routes`:

```js
⬣> routes.findSold.send()
```

The `Scenario` type and `Scenario$` interface are generated automatically into `types/_.context.ts` when you run Counterfact with type generation enabled.

## Startup scenario

The `startup` export in `scenarios/index.ts` is special: it runs automatically when the server initializes, right before the REPL prompt appears. Use it to seed dummy data so the server is immediately useful without any manual REPL commands.

```ts
// scenarios/index.ts
import type { Scenario } from "../types/_.context.js";

export const startup: Scenario = ($) => {
  $.context.addPet({ name: "Fluffy", status: "available", photoUrls: [] });
  $.context.addPet({ name: "Rex", status: "sold", photoUrls: [] });
};
```

In multi-version setups, `$.version` contains the runner's version string (e.g. `"v2"`), or `""` for unversioned runners. Use it to branch initialization logic per version:

```ts
// scenarios/index.ts
import type { Scenario } from "../types/_.context.js";

export const startup: Scenario = ($) => {
  if ($.version === "v2") {
    $.context.featureFlags = { newPagination: true };
  }
  $.context.addPet({ name: "Fluffy", status: "available", photoUrls: [] });
};
```

**Delegating to other scenario functions** keeps `startup` focused and readable. Pass `$` (and any extra arguments) to each helper:

```ts
// scenarios/index.ts
import type { Scenario } from "../types/_.context.js";
import { addPets } from "./pets.js";
import { addOrders } from "./orders.js";

export const startup: Scenario = ($) => {
  addPets($, 20, "dog");
  addOrders($, 5);
};
```

```ts
// scenarios/pets.ts
import type { Scenario$ } from "../types/_.context.js";

export function addPets($: Scenario$, count: number, species: string) {
  for (let i = 0; i < count; i++) {
    $.context.addPet({ name: `${species} ${i + 1}`, status: "available", photoUrls: [] });
  }
}
```

If `startup` is not exported from `scenarios/index.ts`, it is silently skipped — no error is thrown.

## See also

- [Route Builder](./route-builder.md) — fluent request builder with OpenAPI introspection
- [State](./state.md) — the context objects you interact with from the REPL
- [Patterns: Scenario Scripts](../patterns/scenario-scripts.md)
- [Patterns: Live Server Inspection with the REPL](../patterns/repl-inspection.md)
- [Usage](../usage.md)
