# Your first 10 minutes with Counterfact

Start with [Getting Started](./getting-started.md) to run the API and make a
browser request. This follow-on adds only enough authored behavior for a
visible frontend workflow: create a pet, read it back, and show one failure.

## Install a pinned version

For a repeatable project, pin Counterfact and keep the OpenAPI document in the
repository:

```sh
npm install --save-dev --save-exact counterfact
curl --fail --location \
  --output openapi.yaml \
  https://raw.githubusercontent.com/counterfact/api-simulator/3b9f65fe94af0efc8ef4ce4d666a6f7126f7a28c/packages/counterfact/petstore.yaml
npx counterfact ./openapi.yaml api
```

The command writes editable routes and generated types, then starts the API at
`http://localhost:3100`. The generated responses work now; the next sections
make the create/read path predictable for your app.

## Add the smallest useful state

Counterfact supplies the handler argument `$`; its `context` member is an instance of the class you author below. Methods such as `add` and `get` are your application code. See [handler and constructor arguments](./manual/concepts.md#function-arguments).

Create `api/routes/_.context.ts`. Context is shared by nearby routes and stays
available when those routes hot-reload.

```ts
// api/routes/_.context.ts
import type { Pet } from "../types/components/schemas/Pet.js";

export class Context {
  private pets = new Map<number, Pet>();
  private nextId = 1;
  unavailable = false;

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
import type { HTTP_POST } from "../types/paths/pet.types.js";

export const POST: HTTP_POST = function ($) {
  return $.response.status(200).json($.context.add($.body));
};
```

```ts
// api/routes/pet/{petId}.ts
import type { HTTP_GET } from "../../types/paths/pet/{petId}.types.js";

export const GET: HTTP_GET = function ($) {
  const pet = $.context.get($.path.petId);
  return pet
    ? $.response.status(200).json(pet)
    : $.response.status(404).empty();
};
```

## Create a pet and read it back

Run this in your frontend or browser console while the server is running. `name` and `photoUrls` satisfy the pinned Petstore document's required request fields:

```js
const baseUrl = "http://localhost:3100";
const createdResponse = await fetch(`${baseUrl}/pet`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Juniper", photoUrls: [] }),
});
if (!createdResponse.ok)
  throw new Error(`Create failed: ${createdResponse.status}`);
const created = await createdResponse.json();

const readResponse = await fetch(`${baseUrl}/pet/${created.id}`);
if (!readResponse.ok) throw new Error(`Read failed: ${readResponse.status}`);
const found = await readResponse.json();
console.assert(found.id === created.id && found.name === "Juniper");
console.log(found); // the same pet you just created, with its assigned id
```

The GET returns the pet created by POST, rather than an unrelated generated sample. The small in-memory map is sufficient for this client-visible workflow.

## Add one frontend-relevant failure

The missing-record branch above returns `404`. To exercise an unavailable state for the same pet, add this branch at the beginning of the GET handler:

```ts
if ($.context.unavailable) {
  return $.x.response.status(503).text("Try again shortly");
}
```

The pinned Petstore operation does not declare this 503 text response. `$.x` deliberately widens the generated types for this experiment; it does not disable runtime validation. For a contract-defined failure, declare the status and media type in OpenAPI, regenerate, and use the typed `$.response` instead.

At the REPL, set `context.unavailable = true`, then repeat the GET above: it returns 503 for the same resource. Set `context.unavailable = false` and fetch again to recover. The flag changes behavior without reserving a magic pet ID. See [validation boundaries](./manual/validation.md).

Use [Simulate failures](manual/edge-cases.md) for reusable failure
controls and [Simulate latency](manual/edge-cases.md) when loading
behavior needs a delay.

## Continue only when needed

- [Automated integration tests](./patterns/automated-integration-tests.md) explains repeatable lifecycle and reset practices for real HTTP tests.
- [REPL](./features/repl.md) is useful for inspecting a running local API while exploring.
- [Proxy](./features/proxy.md) lets selected paths use an upstream backend while the rest stay local.
- [Generated code](./features/generated-code.md) explains regeneration and the boundary between `routes/` and `types/`.
- The [verified first-10-minutes example](https://github.com/counterfact/api-simulator/tree/main/examples/first-10-minutes) is a checked-in, CI-verified variant with a minimal contract.

For a complete map of the deeper documentation, see [Find your workflow](./usage.md) and
[Reference](./api.md).
