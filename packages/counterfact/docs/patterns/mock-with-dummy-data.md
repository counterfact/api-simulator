# Mock APIs with Dummy Data

Give your UI, demo, or test suite data that looks real enough to be useful—and choose exactly when it should stay fixed.

## Why teams use this

Out-of-the-box random responses conform to the schema but carry meaningless data — random strings, arbitrary numbers. Hardcoding responses in every handler is brittle and hard to maintain. You need a repeatable way to serve controlled, realistic data.

## How it works

Choose the approach that fits how much control you need:

- **Random schema-valid data** — zero effort, good enough to unblock a frontend.
- **Named OpenAPI examples** — define realistic values once in the spec; `random()` selects from them automatically, and you can also reference a specific example by name.
- **Fixed handler data** — return exactly what your client needs from the handler code.
- **Handler logic** — use a `_.context.ts` file to share in-memory state across routes; handlers can filter, sort, calculate, or call external services, though the latter is generally not advised for a mock.

## Example

### Random data (zero effort)

```ts
export const GET: HTTP_GET = ($) => {
  return $.response[200].random();
};
```

### Named OpenAPI example

```ts
export const GET: HTTP_GET = ($) => {
  return $.response[200].example("fullPet");
  //                              ^ name is autocompleted from the spec
};
```

### Fixed data

```ts
export const GET: HTTP_GET = ($) => {
  return $.response[200].json({
    id: $.path.petId,
    name: "Fluffy",
    status: "available",
    photoUrls: ["https://example.com/fluffy.jpg"],
  });
};
```

### Handler logic

Share in-memory state across routes using a `_.context.ts` file:

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

```ts
// api/routes/pet.ts
export const GET: HTTP_GET = ($) => $.response[200].json($.context.list());
export const POST: HTTP_POST = ($) =>
  $.response[200].json($.context.add($.body));

// api/routes/pet/{petId}.ts
export const GET: HTTP_GET = ($) => {
  const pet = $.context.get($.path.petId);
  return pet ? $.response[200].json(pet) : $.response[404].text("Not found");
};
export const DELETE: HTTP_DELETE = ($) => {
  $.context.remove($.path.petId);
  return $.response[200];
};
```

## What you get

- The stateful CRUD approach behaves like a real API for the duration of a session; state resets to zero on server restart.
- Named examples keep realistic values in the spec where they belong, reducing duplication.
- Fixed handler data is easy to write but must be updated manually when the spec changes.
- TypeScript warns when a handler's return value does not match the spec-derived response schema; the server still executes the handler as written, so the developer's intent is respected even during a temporary mismatch.

## Keep exploring

- [Explore a New API](./explore-new-api.md) — start with `.random()` before adding realistic data
- [Model the Workflow, Not the Backend](./model-the-workflow.md) — add only the
  stateful behavior a client workflow needs
- [Reference Implementation](./reference-implementation.md) — turn selected behavior into an executable reference
- [Simulate Failures and Edge Cases](./simulate-failures.md) — add error paths alongside the happy-path handlers
