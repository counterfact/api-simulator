# Your first 10 minutes with Counterfact

Start with [Getting Started](./getting-started.md) to run the API and make a
browser request. This follow-on adds only enough authored behavior for a
visible frontend workflow: create a pet, read it back, and show one failure.

## Install a pinned version

For a repeatable project, pin Counterfact and keep the OpenAPI document in the
repository:

```sh
npm install --save-dev counterfact@2.16.3
curl --fail --location \
  --output openapi.yaml \
  https://raw.githubusercontent.com/counterfact/api-simulator/v2.16.3/petstore.yaml
npx counterfact ./openapi.yaml api
```

The command writes editable routes and generated types, then starts the API at
`http://localhost:3100`. The generated responses work now; the next sections
make the create/read path predictable for your app.

## Add the smallest useful state

Create `api/routes/_.context.ts`. Context is shared by nearby routes and stays
available when those routes hot-reload.

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
}
```

Then use it in the generated `POST /pet` and `GET /pet/{petId}` handlers:

```ts
// api/routes/pet.ts
import type { addPet } from "../types/paths/pet.types.js";

export const POST: addPet = ($) => $.response[200].json($.context.add($.body));
```

```ts
// api/routes/pet/{petId}.ts
import type { getPetById } from "../../types/paths/pet/{petId}.types.js";

export const GET: getPetById = ($) => {
  const pet = $.context.get($.path.petId);
  return pet ? $.response[200].json(pet) : $.response[404].empty();
};
```

From the frontend, create a record and fetch it later with the same localhost
base URL. That is the state you need for a visible create/read flow—no database
or recreation of the production backend required.

## Add one frontend-relevant failure

The missing record branch above returns `404`, so your frontend can implement
an empty or not-found state. When you need a deliberate error branch, add it
to the handler as an explicit response. Keep it narrow and deterministic:

```ts
if ($.path.petId === 99) {
  return $.response[503].text("Try again shortly");
}
```

Use [Simulate failures](./patterns/simulate-failures.md) for reusable failure
controls and [Simulate latency](./patterns/simulate-latency.md) when loading
behavior needs a delay.

## Continue only when needed

- [Automated integration tests](./patterns/automated-integration-tests.md) explains repeatable lifecycle and reset practices for real HTTP tests.
- [REPL](./features/repl.md) is useful for inspecting a running local API while exploring.
- [Proxy](./features/proxy.md) lets selected paths use an upstream backend while the rest stay local.
- [Generated code](./features/generated-code.md) explains regeneration and the boundary between `routes/` and `types/`.
- The [verified first-10-minutes example](https://github.com/counterfact/api-simulator/tree/main/examples/first-10-minutes) is a checked-in, CI-verified variant with a minimal contract.

For a complete map of the deeper documentation, see [Usage](./usage.md) and
[Reference](./reference.md).
