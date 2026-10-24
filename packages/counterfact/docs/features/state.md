# State: Context Objects

The `$.context` object is how routes share in-memory state. It's an instance of the `Context` class exported from `_.context.ts` in the same directory (or the nearest parent directory that has one).

These examples extend the [first-ten-minutes pet workflow](../first-10-minutes.md). `add`, `get`, and the other context methods below are authored application methods; Counterfact supplies `$.context`. Keep the generated handler-type imports in your route files.

```ts
// routes/pet.ts
export const POST: HTTP_POST = function ($) {
  return $.response.status(200).json($.context.add($.body));
};

// routes/pet/{petId}.ts
export const GET: HTTP_GET = function ($) {
  const pet = $.context.get($.path.petId);
  if (pet === undefined) return $.response.status(404).empty();
  return $.response.status(200).json(pet);
};
```

Customize `_.context.ts` to hold whatever state and business logic your mock needs. The `reset()` method below clears this pet collection; it is your method, separate from the simulator-wide `api.reset()` lifecycle operation:

```ts
// api/routes/_.context.ts
import type { Pet } from "../types/components/schemas/Pet.js";

export class Context {
  private pets = new Map<number, Pet>();
  private nextId = 1;

  add(pet: Omit<Pet, "id">): Pet {
    const created = { ...pet, id: this.nextId++ };
    this.pets.set(created.id, created);
    return created;
  }

  get(id: number) {
    return this.pets.get(id);
  }

  list(): Pet[] {
    return [...this.pets.values()];
  }

  remove(id: number): void {
    this.pets.delete(id);
  }

  reset(): void {
    this.pets.clear();
    this.nextId = 1;
  }
}
```

> [!IMPORTANT]
> Keep the state model deliberately small. Start with deterministic handlers and
> add context only when a later request must observe an earlier action. Model
> client-visible workflow states rather than the real backend's persistence,
> jobs, or internal architecture. See [Model the Workflow, Not the
> Backend](../patterns/model-the-workflow.md).
>
> Keep context in memory. Counterfact is a development tool — starting fresh
> each time is a feature, not a bug. In-memory state also makes the server very
> fast.
>
> If a `_.context.ts` file has a syntax/import error, Counterfact prints a warning and skips loading that context file so the app keeps running.

## Nested contexts

A nested context replaces the parent for its route subtree; it does not inherit or merge the parent’s fields. Counterfact passes a separate helper object to context constructors, distinct from a handler’s `$`. Its generated type is `Context$`; see the complete typed example in [nested contexts](../manual/nested-contexts.md).

Use the constructor’s `loadContext(path)` to connect contexts within the same group. A context registry is the collection of live contexts indexed by route path; looking up `/pets` selects the nearest context for that path.

## Loading JSON data with `readJson`

Use the `readJson` function (also passed to the constructor) to load static JSON data into your context. The path is resolved relative to the `_.context.ts` file.

```ts
// routes/_.context.ts
export class Context {
  private readonly readJson: (path: string) => Promise<unknown>;

  constructor({ readJson }: { readJson: (path: string) => Promise<unknown> }) {
    this.readJson = readJson;
  }

  async getSeeds() {
    return this.readJson("../mocks/seeds.json");
  }
}
```

## Sharing state across API groups

An [API group](../manual/concepts.md#api-groups-versions-and-url-prefixes) collects specs that share routes and context state. Separate groups have separate context registries. `basePath` is the output directory containing their group subdirectories. When several groups model
one product and need shared domain data, add a user-authored `_.store.ts` at the
root of `basePath`:

```ts
// _.store.ts
export class Store {
  readonly customers = new Map<string, Customer>();
  readonly orders = new Map<string, Order>();
}
```

Counterfact constructs one store per simulator and passes it to every context
constructor as `$.store`. Import the generated `Context$` type for concrete,
typed access:

```ts
// customers/routes/_.context.ts
import type { Context$ } from "../types/_.context.js";

export class Context {
  readonly store: Context$["store"];

  constructor($: Context$) {
    this.store = $.store;
  }
}
```

The store is not added to route-handler, middleware, or scenario arguments.
Handlers continue to use `$.context`; each context decides which store behavior
to expose to its routes.

The live store survives route, context, and store-module hot reloads as well as
a stop/start cycle on the same simulator. Constructing a new simulator creates a
fresh store. See [Share State Across API Groups](../patterns/shared-store.md) for
a complete multi-group example and reload guidance.

## See also

- [Hot reload](./hot-reload.md) — state is preserved across hot reloads
- [REPL](./repl.md) — inspect and mutate state interactively at runtime
- [Patterns: Federated Context Files](../manual/nested-contexts.md) — managing state across multiple context files
- [Patterns: Model the Workflow, Not the Backend](../patterns/model-the-workflow.md) — deciding how much state to simulate
- [Patterns: Share State Across API Groups](../patterns/shared-store.md) — sharing domain state between independently generated groups
- [Patterns: Test the Context, Not the Handlers](../patterns/test-context-not-handlers.md) — unit-testing context logic
- [Find your workflow](../usage.md)
