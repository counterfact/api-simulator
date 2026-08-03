# State: Context Objects

The `$.context` object is how routes share in-memory state. It's an instance of the `Context` class exported from `_.context.ts` in the same directory (or the nearest parent directory that has one).

```ts
// routes/pet.ts
export const POST: HTTP_POST = ($) => {
  return $.response[200].json($.context.addPet($.body));
};

// routes/pet/{petId}.ts
export const GET: HTTP_GET = ($) => {
  const pet = $.context.getPetById($.path.petId);
  if (pet === undefined)
    return $.response[404].text(`Pet ${$.path.petId} not found.`);
  return $.response[200].json(pet);
};
```

Customize `_.context.ts` to hold whatever state and business logic your mock needs:

```ts
// routes/_.context.ts
export class Context {
  pets: Pet[] = [];

  addPet(pet: Pet) {
    const id = this.pets.length;
    this.pets.push({ ...pet, id });
    return this.pets[id];
  }

  getPetById(id: number) {
    return this.pets[id];
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

For large APIs you can nest context objects. Any subdirectory can have its own `_.context.ts`. One context can access another via the `loadContext` function passed to its constructor:

```ts
// routes/users/_.context.ts
export class Context {
  constructor({ loadContext }) {
    this.rootContext = loadContext("/");
    this.petsContext = loadContext("/pets");
  }
}
```

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

Context registries are isolated between API groups. When several groups model
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
- [Patterns: Federated Context Files](../patterns/federated-context.md) — managing state across multiple context files
- [Patterns: Model the Workflow, Not the Backend](../patterns/model-the-workflow.md) — deciding how much state to simulate
- [Patterns: Share State Across API Groups](../patterns/shared-store.md) — sharing domain state between independently generated groups
- [Patterns: Test the Context, Not the Handlers](../patterns/test-context-not-handlers.md) — unit-testing context logic
- [Usage](../usage.md)
