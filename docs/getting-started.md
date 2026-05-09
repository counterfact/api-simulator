# Getting Started

You have an OpenAPI spec. You need a backend. The real one isn't ready yet.

**Counterfact** solves that problem in one command.

---

## The scenario

Picture a common situation: your team has written a first draft of the OpenAPI doc. The frontend team is ready to build, but the backend isn't done yet — maybe it's two sprints out, maybe it's on another team's roadmap entirely.

What do you do?

You could hardcode fake responses. They'll be wrong within a week and silent about it.

You could wait. Weeks of blocked work, calendar pressure, and frustration.

Or you could run this:

```sh
npx counterfact@latest https://petstore3.swagger.io/api/v3/openapi.json api
```

Counterfact reads the spec, generates typed TypeScript handlers for every endpoint, and starts a live server — all in one command. Within seconds you have a working API that matches your contract exactly.

> **Requires Node ≥ 22.0.0**  
> Supports Swagger 2.0 and OpenAPI 3.0, 3.1, and 3.2.  
> Want to see a fully implemented version of the Petstore — with custom logic, state, and realistic handlers already wired in? Browse [counterfact/example-petstore](https://github.com/counterfact/example-petstore).

---

## What just happened

When you ran that command, three things happened:

**1. Code generation.** Counterfact read the spec and created a `routes/` directory with one `.ts` file per endpoint, plus a `types/` directory with fully typed request/response interfaces derived from the spec:

```
api/
├── routes/
│   ├── pet.ts
│   ├── pet/{petId}.ts
│   └── store/order.ts
└── types/
    └── paths/
        ├── pet.types.ts
        └── ...
```

**2. A server started.** Every endpoint is live immediately. By default, each one returns random, schema-valid data — no editing required.

**3. Swagger UI opened.** Point your browser at `http://localhost:3100/counterfact/swagger/` to explore and test the API.

---

## Making it yours

The generated files are yours to edit. Open one up:

```ts
// api/routes/pet/{petId}.ts
import type { HTTP_GET } from "../../types/paths/pet/{petId}.types.js";

export const GET: HTTP_GET = ($) => {
  return $.response[200].random(); // ← replace this
};
```

Replace `.random()` with `.json()` and return whatever your frontend needs:

```ts
export const GET: HTTP_GET = ($) => {
  if ($.path.petId === 99) {
    return $.response[404].text("Pet not found");
  }
  return $.response[200].json({
    id: $.path.petId,
    name: "Fluffy",
    status: "available",
  });
};
```

Save the file. The server picks it up **immediately** — no restart, no lost state. Your in-memory data survives every hot reload.

TypeScript keeps you honest the whole way. If your response doesn't match the spec, your editor tells you before the server does. JSDoc comments from your OpenAPI descriptions appear inline as you type, so you never have to switch tabs to look up a field name.

---

## Adding state

Real APIs remember things. So can Counterfact.

Create a `_.context.ts` file to share in-memory state across routes in the same directory:

```ts
// api/routes/_.context.ts
import type { Pet } from "../types/components/pet.types.js";

export class Context {
  private pets = new Map<number, Pet>();
  private nextId = 1;

  add(pet: Omit<Pet, "id">): Pet {
    const id = this.nextId++;
    const record = { ...pet, id };
    this.pets.set(id, record);
    return record;
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

Now your routes share that state:

```ts
// api/routes/pet.ts
export const GET: HTTP_GET = ($) => {
  return $.response[200].json($.context.list());
};

export const POST: HTTP_POST = ($) => {
  return $.response[200].json($.context.add($.body));
};
```

```ts
// api/routes/pet/{petId}.ts
export const GET: HTTP_GET = ($) => {
  const pet = $.context.get($.path.petId);
  if (!pet) return $.response[404].text(`Pet ${$.path.petId} not found`);
  return $.response[200].json(pet);
};

export const DELETE: HTTP_DELETE = ($) => {
  $.context.remove($.path.petId);
  return $.response[200];
};
```

POST a pet. GET it back. Delete it and watch the 404 appear. It behaves like a real API — because it is one, just running locally.

---

## Exploring state without touching files

The REPL is a JavaScript prompt connected directly to your running server. You can inspect state, modify it, and fire requests — all while the server handles traffic.

```
⬣> context.list()
[ { id: 1, name: 'Fluffy', status: 'available' } ]

⬣> context.add({ name: 'Rex', photoUrls: [], status: 'pending' })
{ id: 2, name: 'Rex', photoUrls: [], status: 'pending' }

⬣> client.get("/pet/2")
{ status: 200, body: { id: 2, name: 'Rex', ... } }
```

Want to test what happens when the database is empty? Clear it in the REPL. Want to simulate a specific edge case without writing a test? Set it up in the REPL. It's DevTools for your mock server.

---

## Working alongside a real backend

Maybe half the API exists and half doesn't. Use the `--proxy-url` flag to forward real requests to the real backend while mocking everything else:

```sh
npx counterfact@latest openapi.yaml api --proxy-url https://api.example.com
```

You can toggle individual paths at runtime from the REPL:

```
⬣> .proxy on /payments    # forward /payments/* to the real API
⬣> .proxy off /payments   # mock /payments/* again
⬣> .proxy off             # mock everything again
```

---

## When the spec changes

Specs evolve. When yours does, Counterfact handles it automatically: if you're running with `--watch`, it detects the change, regenerates the types, and your IDE picks up the updated interfaces immediately — no restart, no manual command.

If you're not watching, you can regenerate on demand:

```sh
npx counterfact@latest openapi.yaml api --generate-types
```

Either way, Counterfact only scaffolds route files that don't exist yet. Your existing route code is never overwritten. TypeScript surfaces any handlers that no longer match the updated contract — you fix them, and you're done.

---

## Next steps

- [Patterns](./patterns/index.md) — explore an API, simulate failures, hybrid proxy, agentic coding, and more
- [Reference](./reference.md) — `$` parameter, response builder methods, full CLI flags, architecture overview
- [FAQ](./faq.md) — common questions about state, type safety, regeneration, and programmatic use
- [How it compares](./comparison.md) — side-by-side with json-server, WireMock, Prism, Microcks, and MSW
- [Petstore example](https://github.com/counterfact/example-petstore) — a complete worked example of the Swagger Petstore, fully implemented with Counterfact
- [Usage](./usage.md) — full feature documentation
