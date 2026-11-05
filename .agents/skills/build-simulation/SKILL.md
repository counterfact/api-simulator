---
name: build-simulation
description: >
  Build a fully simulated API from an OpenAPI spec using Counterfact.
  Generate the initial scaffold, research the real API's behaviour, implement
  stateful context classes, write tests for those classes, and configure
  scenario scripts (including a startup scenario) so the mock server is
  immediately useful without manual setup. Use for creating a simulation from
  a spec; routine edits to existing routes, contexts, or scenarios use their
  focused skills.
---

# Build-Simulation Skill

## Purpose

Guide an AI agent through the full workflow of turning a bare OpenAPI spec into
a realistic, stateful API simulation using Counterfact. This skill covers every
step: generation, research, context implementation, testing, and scenario setup.
The examples below use the checked-in [pet-shop contract](assets/pet-shop.openapi.yaml)
and a single-API workspace. This small teaching contract differs from the public
Petstore API; use the target API's own generated inputs and responses when adapting it.

---

## Step 1 — Generate the initial scaffold

Run Counterfact against the spec to produce a working server immediately:

```sh
npx counterfact@latest <spec-url-or-path> <output-directory>
```

To reproduce this skill's examples from the repository root, build the current
checkout, then generate from its matching contract:

```sh
yarn build
node packages/counterfact/bin/counterfact.js .agents/skills/build-simulation/assets/pet-shop.openapi.yaml api
```

This creates:

```
<output-directory>/
├── routes/          # one .ts file per API path — edit these
└── types/           # generated request/response types — never edit these
```

Generated nonstreaming handlers with response bodies normally return
schema-derived random data (`.random()`). Bodyless responses use `.empty()`.
Streaming responses use `.stream(items())` with an initially empty async
iterator; add `yield` statements to provide streaming fixtures. The simulation
work that follows replaces these defaults with realistic, stateful behaviour.

> **Docs:** [Getting Started](https://counterfact.dev/docs/getting-started.html)

---

## Step 2 — Research the real API

For a public API, look up official documentation before writing simulation
code. For a private API, use the supplied contract and available product
documentation, and label assumptions that need verification. Understanding what the real
API actually does is what separates a useful simulation from a pretty type stub.

Do at least the following:

1. **Read the official API docs** — authentication flows, pagination styles,
   required vs. optional fields, status codes, error shapes, and any notable
   business rules (e.g. "a pet cannot be ordered if its status is `sold`").
2. **Check for public examples and SDKs** — official SDKs often clarify
   which fields are commonly populated and how resources relate to each other.
3. **Note realistic data shapes** — names, IDs, statuses, and dates that
   appear in the real API's example responses will make the simulation
   convincing.

Use this research to inform what methods the context classes should expose,
what validation the context should perform, and what data the startup scenario
should seed.

---

## Step 3 — Implement context classes

Handlers should be thin. All stateful logic — lookups, mutations, derived
data, invariants, error conditions — belongs in a `_.context.ts` file. Handlers
read from context and return responses; they contain no business logic of
their own.

### Single-domain API

Place one `_.context.ts` at the root of the routes tree:

```ts
// api/routes/_.context.ts
import type { Schemas } from "../types/index.js";

type Pet = Schemas["Pet"];

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

  list(status?: Pet["status"]): Pet[] {
    const all = [...this.pets.values()];
    return status ? all.filter((p) => p.status === status) : all;
  }

  remove(id: number): boolean {
    return this.pets.delete(id);
  }

  markAllSold(): void {
    for (const pet of this.pets.values()) pet.status = "sold";
  }
}
```

Then wire the context into each handler, retaining the generated imports:

```ts
// api/routes/pet.ts
import type { Routes } from "../types/index.js";

export const GET: Routes["/pet"]["GET"] = function ($) {
  return $.response.status(200).json($.context.list($.query.status));
};

export const POST: Routes["/pet"]["POST"] = function ($) {
  return $.response.status(200).json($.context.add($.body));
};
```

```ts
// api/routes/pet/{petId}.ts
import type { Routes } from "../../types/index.js";

export const GET: Routes["/pet"]["/{petId}"]["GET"] = function ($) {
  const pet = $.context.get($.path.petId);
  return pet
    ? $.response.status(200).json(pet)
    : $.response.status(404).text(`Pet ${$.path.petId} not found`);
};

export const DELETE: Routes["/pet"]["/{petId}"]["DELETE"] = function ($) {
  $.context.remove($.path.petId);
  return $.response.status(200).empty();
};
```

### Multi-domain API

For APIs with several distinct domains (users, orders, payments, …), give each
domain its own `_.context.ts` at its subtree boundary. Inject the generated
`Context$` into the context constructor to reach another domain with
`loadContext(path)`. Put the lookup and composition in a context method, then
have the route call it. Handler arguments do not expose `loadContext`.

```ts
// api/routes/payments/_.context.ts
import type { Context$ } from "../../types/index.js";
import type { Context as UsersContext } from "../users/_.context.js";

export class Context {
  payments: { id: string; userId: string }[] = [];

  constructor(private $: Context$) {}

  getWithUser(id: string) {
    const payment = this.payments.find((p) => p.id === id);
    if (!payment) return undefined;

    const users: UsersContext = this.$.loadContext("/users");
    return { ...payment, user: users.getById(payment.userId) };
  }
}
```

This example assumes the users context implements `getById(id: string)` and
that the spec declares a string `paymentId` path parameter. Generate types
again after adding the context files so the typed `/users` overload is present.

```ts
// api/routes/payments/{paymentId}.ts
import type { Routes } from "../../types/index.js";

export const GET: Routes["/payments"]["/{paymentId}"]["GET"] = function ($) {
  const payment = $.context.getWithUser($.path.paymentId);
  return payment
    ? $.response.status(200).json(payment)
    : $.response.status(404).text("Payment not found");
};
```

Keep each context class focused on a single responsibility. If a class is
growing too large, split it along domain lines.

> **Docs:**
>
> - [State: Context Objects](https://counterfact.dev/docs/features/state.html)
> - [Pattern: Mock APIs with Dummy Data](https://counterfact.dev/docs/manual/sample-responses)
> - [Pattern: Federated Context Files](https://counterfact.dev/docs/manual/nested-contexts)

---

## Step 4 — Test the context classes

The context class accumulates real logic; bugs in it break every handler that
depends on it. Write unit tests that exercise the class directly, with no
server, no `$` object, and no HTTP machinery.

```ts
// test/context.test.ts
import { Context } from "../api/routes/_.context.js";

describe("Context", () => {
  let context: Context;

  beforeEach(() => {
    context = new Context();
  });

  it("assigns sequential ids", () => {
    const a = context.add({
      name: "Fluffy",
      status: "available",
      photoUrls: [],
    });
    const b = context.add({ name: "Rex", status: "available", photoUrls: [] });
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
  });

  it("returns undefined for an unknown id", () => {
    expect(context.get(99)).toBeUndefined();
  });

  it("filters by status", () => {
    context.add({ name: "Fluffy", status: "available", photoUrls: [] });
    context.add({ name: "Rex", status: "sold", photoUrls: [] });
    expect(context.list("sold")).toHaveLength(1);
  });

  it("removes a pet", () => {
    const pet = context.add({
      name: "Fluffy",
      status: "available",
      photoUrls: [],
    });
    context.remove(pet.id);
    expect(context.get(pet.id)).toBeUndefined();
  });

  it("marks existing pets sold without replacing them", () => {
    const pet = context.add({
      name: "Rex",
      status: "available",
      photoUrls: [],
    });
    context.markAllSold();
    expect(context.get(pet.id)).toBe(pet);
    expect(pet.status).toBe("sold");
  });
});
```

Test domain logic directly through the context class. Use HTTP integration
tests when response mapping, request parsing, status selection, or serialization
carries behavior that context tests cannot establish. Keep those checks focused
on the responses a consumer observes.

> **Docs:** [Pattern: Test the Context, Not the Handlers](https://counterfact.dev/docs/patterns/test-context-not-handlers.html)

---

## Step 5 — Set up scenario scripts

Scenario scripts are TypeScript files in the `scenarios/` directory. Each
file exports named functions that receive a `$` argument giving access to live
context and a route builder. Run them from the REPL with `.scenario`, or have
one run automatically at startup.

Follow the [scenario skill](../scenario/SKILL.md) for composition, prerequisite
state, explicit destructive names, and baseline ownership. Named conditions
should preserve unrelated state and earlier compatible scenario effects.

### The startup scenario

Export a function named `startup` from `scenarios/index.ts`. Counterfact calls
it automatically when the server initialises, right before the REPL prompt
appears. Use it to seed realistic data so the server is immediately useful
without any manual REPL commands.

```ts
// api/scenarios/index.ts
import type { Scenario } from "../types/index.js";

export const startup: Scenario = ($) => {
  $.context.add({ name: "Fluffy", status: "available", photoUrls: [] });
  $.context.add({ name: "Rex", status: "sold", photoUrls: [] });
};
```

For a larger pet collection, use this alternative startup with a helper in a
separate file. Both files use the same teaching contract and root context as
the example above:

```ts
// api/scenarios/index.ts
import type { Scenario } from "../types/index.js";
import { addPets } from "./pets.js";

export const startup: Scenario = ($) => {
  addPets($, 20, "dog");
};
```

```ts
// api/scenarios/pets.ts
import type { Scenario$ } from "../types/index.js";

export function addPets($: Scenario$, count: number, species: string) {
  for (let i = 0; i < count; i++) {
    $.context.add({
      name: `${species} ${i + 1}`,
      status: "available",
      photoUrls: [],
    });
  }
}
```

### Additional scenario scripts

Write named exports for other useful states — an empty store, a rate-limited
service, a full inventory. Run them from the REPL whenever you need them:

```ts
// api/scenarios/index.ts
import type { Scenario } from "../types/index.js";

export const soldOut: Scenario = ($) => {
  $.context.markAllSold();
};
```

```
⬣> .scenario soldOut
Applied soldOut
```

> **Docs:**
>
> - [Pattern: Scenario Scripts](https://counterfact.dev/docs/patterns/scenario-scripts.html)
> - [Feature: REPL](https://counterfact.dev/docs/features/repl.html)

---

## Step 6 — Add failure and edge-case scenarios

Encode failure conditions in the context and toggle them on demand. This lets
consumers of the simulation test error-handling code without coordinating with
the real API.

```ts
// api/routes/_.context.ts
export class Context {
  isRateLimited = false;
  isDown = false;
  // … rest of context …
}
```

```ts
// api/routes/pet/{petId}.ts
// Alternative GET implementation.
import type { Routes } from "../../types/index.js";
export const GET: Routes["/pet"]["/{petId}"]["GET"] = function ($) {
  if ($.context.isDown)
    return $.response.status(500).text("Service unavailable");
  if ($.context.isRateLimited)
    return $.response.status(429).text("Too many requests");
  const pet = $.context.get($.path.petId);
  return pet
    ? $.response.status(200).json(pet)
    : $.response.status(404).text("Not found");
};
```

Toggle from the REPL or via a scenario:

```
⬣> context.isRateLimited = true
⬣> await client.get("/pet/1")
GET /pet/1 HTTP/1.1
…
HTTP/1.1 429 Too Many Requests
…
Too many requests
```

`client.get` returns a promise for the raw HTTP response string and prints
the request and response. The transcript above omits headers and formatting;
it is not a parsed `{ status, body }` object.

> **Docs:** [Pattern: Simulate Failures and Edge Cases](https://counterfact.dev/docs/manual/edge-cases)

---

## Quick-reference: key documentation

| Topic                                       | URL                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------- |
| Getting started                             | https://counterfact.dev/docs/getting-started.html                     |
| Full usage guide                            | https://counterfact.dev/docs/usage.html                               |
| Reference (`$` param, CLI flags)            | https://counterfact.dev/docs/api                                      |
| State / context objects                     | https://counterfact.dev/docs/features/state.html                      |
| REPL                                        | https://counterfact.dev/docs/features/repl.html                       |
| Pattern: Mock with Dummy Data               | https://counterfact.dev/docs/manual/sample-responses                  |
| Pattern: Federated Context Files            | https://counterfact.dev/docs/manual/nested-contexts                   |
| Pattern: Test the Context, Not the Handlers | https://counterfact.dev/docs/patterns/test-context-not-handlers.html  |
| Pattern: Scenario Scripts                   | https://counterfact.dev/docs/patterns/scenario-scripts.html           |
| Pattern: Simulate Failures and Edge Cases   | https://counterfact.dev/docs/manual/edge-cases                        |
| Pattern: AI-Assisted Implementation         | https://counterfact.dev/docs/patterns/ai-assisted-implementation.html |
| Petstore example                            | https://github.com/counterfact/example-petstore                       |

---

## Checklist

Work through these steps in order:

- [ ] Run `npx counterfact@latest` to generate the initial scaffold
- [ ] Read the real API's documentation and note key business rules and data shapes
- [ ] Implement a `_.context.ts` with typed methods for all CRUD operations
- [ ] Update each handler to delegate to the context instead of calling `.random()`
- [ ] Write context unit tests and focused HTTP checks for observable adapter behavior
- [ ] Export a `startup` function from `scenarios/index.ts` that seeds realistic data
- [ ] Add named scenario exports for useful non-default states (empty, error, edge cases)
- [ ] Apply compatible scenarios together and verify both effects and unrelated state survive
- [ ] Verify the server starts with realistic data by running it and checking the REPL
