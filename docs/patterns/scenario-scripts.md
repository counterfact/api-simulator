# Scenario Scripts

Save the REPL setups you use more than once: seed data, configure state, and build reusable request sequences that run on demand or at startup.

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

  // Store a pre-configured route builder in the REPL environment
  $.routes.findSold = $.route("/pet/findByStatus")
    .method("get")
    .query({ status: "sold" });
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

After running, anything stored in `$.routes` is immediately available in the REPL:

```js
⬣> routes.findSold.send()
```

### Automatic startup

Export a function named `startup` from `scenarios/index.ts` and Counterfact calls it automatically when the server initializes, right before the REPL prompt appears — no manual command required:

```ts
// scenarios/index.ts
import type { Scenario } from "../types/_.context.js";

export const startup: Scenario = ($) => {
  $.context.addPet({ name: "Fluffy", status: "available", photoUrls: [] });
  $.context.addPet({ name: "Rex", status: "sold", photoUrls: [] });
};
```

If `startup` is not exported, the server starts normally with no error.

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
export const addThreeDogs: Scenario = ($) => addPets($, 3, "dog");
```

```
⬣> .scenario pets/addThreeDogs
```

## What you get

- Scenario functions are plain TypeScript — no special framework, fully type-checked, easy to test in isolation.
- `.scenario` provides on-demand state changes without editing handler files or restarting the server.
- `startup` gives the server a deterministic initial state on every restart, eliminating manual seeding steps.
- Helper functions accepting extra arguments let the same logic be used for both realistic production volumes (at startup) and minimal data (in the REPL during debugging).
- Scenarios live alongside your handler code, making them easy to discover and keep in sync with the API.

## Keep exploring

- [Mock APIs with Dummy Data](./mock-with-dummy-data.md) — the full range of approaches for populating server responses
- [Live Server Inspection with the REPL](./repl-inspection.md) — interactive exploration and state manipulation at runtime
- [Federated Context Files](./federated-context.md) — organize stateful logic that scenarios can seed
- [Simulate Failures and Edge Cases](./simulate-failures.md) — use scenarios to flip failure flags on demand
