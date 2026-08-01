# Test the Context, Not the Handlers

Keep the stateful logic in `_.context.ts` easy to exercise and dependable as the mock grows.

## Why teams use this

Handler files are intentionally thin — they read from context, return a response, and contain minimal business logic. The context class, on the other hand, accumulates meaningful logic: lookups, mutations, invariants, and derived data. As the context grows, bugs in it break every handler that depends on it, but nothing makes those bugs visible until a manual test fails.

## How it works

Write unit tests for the context class. Test its methods directly, without starting the server. Leave handler files untested: they are expected to be edited freely and contain no logic worth automating against.

## Example

Given a context class:

```ts
// api/routes/_.context.ts
import type { Pet } from "../types/components/pet.types.js";

export class Context {
  private pets = new Map<number, Pet>();
  private nextId = 1;

  add(data: Omit<Pet, "id">): Pet {
    const pet = { ...data, id: this.nextId++ };
    this.pets.set(pet.id, pet);
    return pet;
  }

  get(id: number): Pet | undefined {
    return this.pets.get(id);
  }
  list(): Pet[] {
    return [...this.pets.values()];
  }
  remove(id: number): void {
    this.pets.delete(id);
  }
}
```

Write tests that exercise the class directly:

```ts
import { Context } from "../api/routes/_.context.js";

describe("Context", () => {
  let context: Context;

  beforeEach(() => {
    context = new Context();
  });

  it("assigns sequential ids", () => {
    const first = context.add({
      name: "Fluffy",
      status: "available",
      photoUrls: [],
    });
    const second = context.add({
      name: "Rex",
      status: "available",
      photoUrls: [],
    });
    expect(first.id).toBe(1);
    expect(second.id).toBe(2);
  });

  it("returns undefined for a missing id", () => {
    expect(context.get(99)).toBeUndefined();
  });

  it("removes a pet", () => {
    const pet = context.add({
      name: "Fluffy",
      status: "available",
      photoUrls: [],
    });
    context.remove(pet.id);
    expect(context.get(pet.id)).toBeUndefined();
    expect(context.list()).toHaveLength(0);
  });
});
```

The context class has no dependency on Counterfact internals — no server, no `$` object, no HTTP machinery — so the tests are fast, isolated, and easy to write.

## What you get

- Context logic is covered by fast unit tests that catch regressions without starting a server.
- Handlers stay thin and free of business logic; they are not tested and can be modified without worrying about breaking tests.
- The split creates a clear seam: if a handler is doing anything complex, it is a signal to move that logic into the context.
- Tests written against the context class remain valid after handler rewrites or spec changes that do not alter the context's interface.

## Keep exploring

- [Mock APIs with Dummy Data](./mock-with-dummy-data.md) — the context pattern the tests above are written for
- [AI-Assisted Implementation](./ai-assisted-implementation.md) — unit-test the context the agent generates to keep it reliable
- [Reference Implementation](./reference-implementation.md) — a reference implementation accumulates significant context logic that benefits from test coverage
