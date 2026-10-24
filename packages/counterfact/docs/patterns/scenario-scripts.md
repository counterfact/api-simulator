# Scenario Scripts

Save the REPL setups you use more than once: seed data, configure state, and build reusable request sequences that run on demand. Seed context state at startup.

## Why teams use this

The REPL is powerful for ad-hoc exploration, but many setup tasks are predictable: seed a set of pets before a demo, reset state to a known baseline for a test, or configure a reusable route builder for a common request. Retyping these commands every time the server restarts is tedious and error-prone.

## How it works

Write _scenario scripts_ — TypeScript files in the `scenarios/` directory that export named functions. Each function receives a single `$` argument that exposes the full live context and route builder. Run any export on demand from the REPL with `.scenario`, or have one run automatically at startup.

### Writing a scenario

Scenario functions are typed with the generated `Scenario` type:

```ts
// scenarios/index.ts
import type { Scenario } from "../types/_.context.js";

export const soldPets: Scenario = ($) => {
  // Mutate context directly — the same object route handlers see as $.context
  $.context.petService.reset();
  $.context.petService.addPet({ id: 1, status: "sold" });
  $.context.petService.addPet({ id: 2, status: "available" });
};
```

### Running scenarios from the REPL

Use the `.scenario` command. The argument is a slash-separated path where the last segment is the function name and everything before it is the file path relative to `scenarios/` (with `index.ts` as the default):

```
⬣> .scenario soldPets
Applied soldPets
```

| Command                         | File                       | Function   |
| ------------------------------- | -------------------------- | ---------- |
| `.scenario soldPets`            | `scenarios/index.ts`       | `soldPets` |
| `.scenario pets/resetAll`       | `scenarios/pets.ts`        | `resetAll` |
| `.scenario pets/orders/pending` | `scenarios/pets/orders.ts` | `pending`  |

For multiple API groups, select the group explicitly, for example `.scenario pets soldPets`.

Generated `Scenario$` currently types `route(...)` and entries in `routes` as `unknown`, so the fluent builder API is not type-checked through that surface. Build a reusable request separately at the untyped REPL prompt after running the state scenario:

```js
⬣> routes.findSold = route("/pet/findByStatus").method("get").query({ status: "sold" })
⬣> routes.findSold.send()
```

### Running scenarios from test code

After starting a simulator, call `await simulator.scenario("soldPets")` or
`await simulator.scenario("pets/orders/pending", "pets")` for an explicit group.
Counterfact supplies the same argument as the REPL and awaits async work.
Use `await simulator.reset()` before each test to reconstruct the baseline;
re-running a seed scenario alone can retain mutations or duplicate records.
See [Programmatic API](../features/programmatic-api.md) for concurrency,
error handling, and reference-lifetime rules.

### Automatic startup

Export a function named `startup` from `scenarios/index.ts` and Counterfact calls it automatically when the server initializes, before the HTTP server starts listening — no manual command required:

```ts
// scenarios/index.ts
import type { Scenario } from "../types/_.context.js";

export const startup: Scenario = ($) => {
  $.context.addPet({ name: "Fluffy", status: "available", photoUrls: [] });
  $.context.addPet({ name: "Rex", status: "sold", photoUrls: [] });
};
```

If `startup` is not exported, the server starts normally with no error. Startup is awaited once per API group. Seed context directly there; requests to this same server cannot complete before it starts listening. Startup receives the API group’s shared `routes` collection. Named builders saved there are available in the later REPL and on-demand scenarios. Reset replaces the collection, then reruns startup so it can recreate those builders; reacquire references after reset. Builders created before an ephemeral port is bound resolve the actual port when sent. Construct builders during startup, but do not send requests to this server until startup completes and the listener is ready. The generated scenario types expose builders as `unknown`; narrow them explicitly when using their methods.

### Delegating to helpers with extra arguments

Split large scenarios into focused helper functions in separate files and pass `$` (and any extra arguments) through. This keeps each file small and lets you call the same helpers from both `startup` and the REPL with different parameters:

```ts
// scenarios/index.ts
import type { Scenario } from "../types/_.context.js";
import { addPets } from "./pets.js";
import { addOrders } from "./orders.js";

export const startup: Scenario = ($) => {
  addPets($, 20, "dog"); // seed 20 dogs at startup
  addOrders($, 5);
};
```

```ts
// scenarios/pets.ts
import type { Scenario$ } from "../types/_.context.js";

export function addPets($: Scenario$, count: number, species: string) {
  for (let i = 0; i < count; i++) {
    $.context.addPet({
      name: `${species} ${i + 1}`,
      status: "available",
      photoUrls: [],
    });
  }
}
```

```ts
// scenarios/orders.ts
import type { Scenario$ } from "../types/_.context.js";

export function addOrders($: Scenario$, count: number) {
  for (let i = 0; i < count; i++) {
    $.context.addOrder({ petId: i + 1, quantity: 1, status: "placed" });
  }
}
```

Named scenario exports that need no extra arguments can also be called as standalone `.scenario` commands. The REPL command does not pass arbitrary arguments, so wrap parameterized helpers in a named scenario first:

```ts
// scenarios/pets.ts
import type { Scenario } from "../types/_.context.js";

export const addThreeDogs: Scenario = ($) => addPets($, 3, "dog");
```

```
⬣> .scenario pets/addThreeDogs
```

## What you get

- Scenario functions are plain TypeScript — no special framework, fully type-checked, easy to test in isolation.
- `.scenario` provides on-demand state changes without editing handler files or restarting the server.
- `startup` applies your authored initialization on every restart. Fixed seed data and controlled inputs make that initial state repeatable; the hook does not make random or time-dependent initialization deterministic.
- Helper functions accepting extra arguments let the same logic create a repeatable baseline at startup and smaller targeted variants during debugging.
- Scenarios live alongside your handler code, making them easy to discover and keep in sync with the API.

## Keep exploring

- [Model the Workflow, Not the Backend](./model-the-workflow.md) — keep each
  scenario focused on a client-visible state rather than a production data model
- [Mock APIs with Dummy Data](../manual/sample-responses.md) — the full range of approaches for populating server responses
- [Live Server Inspection with the REPL](../features/repl.md) — interactive exploration and state manipulation at runtime
- [Federated Context Files](../manual/nested-contexts.md) — organize stateful logic that scenarios can seed
- [Simulate Failures and Edge Cases](../manual/edge-cases.md) — use scenarios to flip failure flags on demand
