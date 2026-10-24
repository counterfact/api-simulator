# Test the Context, Not the Handlers

Keep route handlers small: read the request, call a context method, and return
a response. Put lookups, updates, and other shared logic in the context class,
where you can test it without starting a server.

<span id="why-teams-use-this"></span>
<span id="how-it-works"></span>
<span id="example"></span>

## Test context methods directly

This example uses the same `add`, `get`, `list`, and `remove` methods as the [pet context in the state guide](../features/state.md), with generated types from the first-ten-minutes Petstore contract. Given that context class:

```ts
// api/routes/_.context.ts
import type { Pet } from "../types/components/schemas/Pet.js";

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

<span id="what-you-get"></span>

## Keep shared logic in the context

If a handler needs more than request parsing and response building, move that
logic into a context method and test it there. Those tests can stay the same
when you rewrite handlers or change parts of the spec that do not affect the
context. Use [HTTP integration tests](./automated-integration-tests.md) to check
the responses your client receives.

<span id="keep-exploring"></span>

## Related guides

- [Share State Across API Groups](./shared-store.md) — apply the same testing boundary to context methods that wrap shared-store behavior
- [Mock APIs with Dummy Data](../manual/sample-responses.md) — the context pattern the tests above are written for
- [AI-Assisted Implementation](./ai-assisted-implementation.md) — unit-test the context the agent generates to keep it reliable
- [Reference Implementation](model-the-workflow.md) — a reference implementation accumulates significant context logic that benefits from test coverage
