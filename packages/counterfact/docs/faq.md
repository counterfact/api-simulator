# FAQ

Answers to the questions that come up when you take Counterfact from a quick try to a team workflow.

---

## Contents

- [What is Counterfact?](#what-is-counterfact)
- [Who is it for?](#who-is-it-for)
- [How do I start?](#how-do-i-start)
- [What does it generate?](#what-does-it-generate)
- [Do I have to write TypeScript?](#do-i-have-to-write-typescript)
- [Should I commit the generated code?](#should-i-commit-the-generated-code)
- [Can it behave like a real backend?](#can-it-behave-like-a-real-backend)
- [How does state work?](#how-does-state-work)
- [What happens when I edit a file?](#what-happens-when-i-edit-a-file)
- [Can I interact with the server without writing code?](#can-i-interact-with-the-server-without-writing-code)
- [What if the real API exists but isn't ready for all paths?](#what-if-the-real-api-exists-but-isnt-ready-for-all-paths)
- [How does type safety work?](#how-does-type-safety-work)
- [Does it validate incoming requests?](#does-it-validate-incoming-requests)
- [What OpenAPI versions are supported?](#what-openapi-versions-are-supported)
- [Can I have more granular control over code generation?](#can-i-have-more-granular-control-over-code-generation)
- [Will regenerating overwrite my changes?](#will-regenerating-overwrite-my-changes)
- [Can I use it programmatically (not via the CLI)?](#can-i-use-it-programmatically-not-via-the-cli)
- [Can I add custom middleware?](#can-i-add-custom-middleware)
- [What's with these `never` types in the generated code?](#whats-with-these-never-types-in-the-generated-code)
- [Do I need to restart after changing a routes file?](#do-i-need-to-restart-after-changing-a-routes-file)
- [When do I need to restart?](#when-do-i-need-to-restart)
- [Where does the generated code go?](#where-does-the-generated-code-go)

---

## What is Counterfact?

Counterfact is a tool that turns an OpenAPI spec into a live, editable, stateful mock server — in one command. It generates TypeScript route files (one per endpoint), starts an HTTP server, and lets you customize behavior by editing those files while the server keeps running.

---

## Who is it for?

**Frontend developers** who can't wait for the backend.

**API-first teams** who write the spec before writing any code and want to validate the design immediately.

**QA engineers** who need to reproduce specific edge cases and error states on demand.

**Developers writing automated tests** — Counterfact runs a real HTTP server, so it works seamlessly in integration and end-to-end test suites. Start it in a `beforeAll`, run your tests, tear it down in `afterAll`.

**AI agents** that make calls to third-party APIs — running against a local mock avoids rate limits, costs, and network flakiness.

**Developers exploring a new API** before they have production credentials or a signed contract.

---

## How do I start?

One command:

```sh
npx counterfact@latest https://petstore3.swagger.io/api/v3/openapi.json api
```

Replace the Petstore URL with your own spec. A `routes/` directory and `types/` directory appear in `api/`, and a server starts at `http://localhost:3100`. No config file required.

> **Requires Node ≥ 22.0.0**

For a complete worked example — the Swagger Petstore fully implemented with custom logic and state — see [counterfact/example-petstore](https://github.com/counterfact/example-petstore).

---

## What does it generate?

Two things:

1. **`routes/`** — one `.ts` file per path in your OpenAPI spec. Each file exports a named function per HTTP method. By default they return random, schema-valid responses.

2. **`types/`** — TypeScript interfaces for every request and response defined in the spec, including path params, query params, headers, and request/response bodies.

---

## Do I have to write TypeScript?

No. The generated files are valid TypeScript but you don't need to compile them yourself — Counterfact runs them directly. If you prefer plain JavaScript, you can rename the files and remove the type annotations. You'll lose autocomplete and compile-time safety, but the server will still work.

---

## Should I commit the generated code?

Yes, commit everything.

Commit the `routes/` directory — that's your code. Counterfact generates starter files and after that doesn't touch them again.

In theory the `types/` directory can be reproduced from the spec, so you might `.gitignore` it. But if the spec is owned by another team or organization, committing `types/` means the team always has a working snapshot without needing to re-run generation. Counterfact creates a `.gitignore` that excludes `.cache/` — do commit `.gitignore`, don't commit `.cache/`.

---

## Can it behave like a real backend?

It can reproduce the client-visible behavior your workflow needs. A generated
route is just a function, so it can return a deterministic response or use a
small shared context:

```ts
export const POST: HTTP_POST = function ($) {
  if (!$.body.name) return $.response.status(400).text("name is required");
  const pet = $.context.add($.body);
  return $.response.status(200).json(pet);
};
```

POST data and GET it back. Select a validation outcome. Simulate the state
transitions relevant to a client. Do not treat that flexibility as a reason to
copy the production data model or every backend rule—the value of the simulator
is that its API-shaped world stays predictable and easy to reset. See [Model the
Workflow, Not the Backend](./patterns/model-the-workflow.md).

---

## How does state work?

Create a `_.context.ts` file next to your routes. All routes in the same directory (and subdirectories) share the same `Context` instance:

```ts
// routes/_.context.ts
export class Context {
  private orders = new Map<number, Order>();
  private id = 1;

  place(order: Omit<Order, "id">): Order {
    const record = { ...order, id: this.id++ };
    this.orders.set(record.id, record);
    return record;
  }

  get(id: number) {
    return this.orders.get(id);
  }
  list() {
    return [...this.orders.values()];
  }
}
```

State is in-memory, which means it's lightning-fast, it resets to a known clean state every restart, and scalability isn't something you need to worry about because you're the only one using it.

---

## What happens when I edit a file?

The server hot-reloads it. The new handler takes effect immediately — no restart, no data loss. Your context (in-memory state) is preserved across reloads.

---

## Can I interact with the server without writing code?

Yes. The REPL is a JavaScript prompt connected directly to the running server. Type expressions, call methods, inspect state, send requests:

```
⬣> context.list()
[ { id: 1, status: 'placed', petId: 42 } ]

⬣> context.place({ status: 'approved', petId: 99 })
{ id: 2, status: 'approved', petId: 99 }

⬣> client.get("/store/order/1")
{ status: 200, body: { id: 1, status: 'placed', petId: 42 } }
```

---

## What if the real API exists but isn't ready for all paths?

Use the `--proxy-url` flag to forward requests to the real backend and mock the paths that aren't ready yet:

```sh
npx counterfact@latest openapi.yaml api --proxy-url https://api.example.com
```

You can toggle individual paths from the REPL at runtime:

```
⬣> .proxy on /payments      # forward /payments/* to the real API
⬣> .proxy off /payments     # mock /payments/* again
⬣> .proxy off               # disable the root proxy default
```

The root `.proxy off` command leaves explicit path overrides in place. Disable any remaining path-specific `on` settings separately. For a setup that survives restarts, use the [checked-in hybrid recipe](./patterns/hybrid-proxy.md#check-in-a-hybrid-setup).

---

## How does type safety work?

Every route handler type is generated from the spec. When you call `.json(...)` on a response builder, TypeScript checks that the object you pass matches the schema defined in the spec. When the spec changes and you regenerate, an editor or explicit TypeScript check can report mismatches in checked, typed handlers. Serving and hot-reloading TypeScript does not itself run a full project typecheck; untyped code and `$.x` can bypass these authoring checks. See the [contract-change check](./patterns/contract-change.md).

OpenAPI descriptions are preserved as JSDoc comments on the generated types, so they appear inline in your editor as you type.

---

## Does it validate incoming requests?

Yes, for required query, header, and cookie parameters and supported JSON/form request bodies. Detected mismatches return a `400` automatically. Disable this with `--no-validate-request` if you need looser behavior.

---

## Does it validate outgoing responses?

Yes, by default. Response headers are validated against the schema defined in the spec. When a handler omits `status`, Counterfact validates it against the `200` response definition, matching the status sent over HTTP. Any validation errors (missing required headers or type mismatches) are reported as `response-type-error` HTTP response headers — one header per error; multiple headers with the same name are allowed. The response body is still returned normally — the errors are advisory only. Disable this with `--no-validate-response` if you need looser behavior.

---

## What OpenAPI versions are supported?

Swagger 2.0 and OpenAPI 3.0, 3.1, and 3.2.

---

## Can I have more granular control over code generation?

Yes. Use `--generate-types` or `--generate-routes` to generate only one or the other. Use `--watch-types` or `--watch-routes` to watch selectively. This is useful when you're mid-feature and don't want unrelated type updates cluttering your staging area.

```sh
npx counterfact@latest my-api.yaml api --generate-types
```

---

## Will regenerating overwrite my changes?

No. Counterfact never overwrites an existing route file. Your custom route logic is always preserved.

If you add a new HTTP method to an existing path in your spec (for example adding `POST` to a route that already has `GET`), Counterfact **appends** the new handler stub to the bottom of the existing file and inserts its `import type` statement after the existing imports. All pre-existing code in the file is left untouched.

Existing handlers declared as functions or exported through aliases are also
recognized. Type-only exports do not count as runtime handlers and do not prevent
new handler generation. Multiline imports and their comments remain intact, and a new
handler's type import receives an alias if its name is already in use.

---

## Can I use it programmatically (not via the CLI)?

Yes. Import `counterfact` to start a local API from your application or test runner, control its state, and await shutdown when the work finishes.

Follow the [Programmatic API guide](./features/programmatic-api.md) for startup examples, defaults, reset behavior, and teardown. Use the [simulator lifecycle reference](./api/simulator.md) for exact options and methods, or [automated integration tests](./patterns/automated-integration-tests.md) for test-runner integration.

---

## Can I add custom middleware?

Yes. Export a named `middleware` function from a route subtree's `_.middleware.ts`. It receives Counterfact's typed request argument and a `respondTo($)` callback. Use the generated middleware type for that directory.

See [middleware](./features/middleware.md) for authentication, response headers, logging, and directory scoping.

---

## What's with these `never` types in the generated code?

If you see `query: never` in a types file it means the OpenAPI spec doesn't define any query parameters for that operation. TypeScript will flag `$.query.anything` as a type error — by design. If the spec is incomplete, fix it at the source.

---

## Do I need to restart after changing a routes file?

No. Counterfact watches the routes directory and hot-reloads changed files immediately. Your in-memory context is preserved across reloads.

---

## When do I need to restart?

Counterfact watches every local file that contributes to the OpenAPI document,
including the base spec and ordered overlays. Editing any of those files
reloads the complete composed document and regenerates enabled artifacts, so no
restart is required. HTTP(S) inputs are loaded at startup but are not watched;
restart to pick up a remote-only change. If a remote base uses a local overlay,
editing that overlay triggers a fresh load of the remote base before all
overlays are reapplied.

---

## Where does the generated code go?

Wherever you tell it. The second argument to the CLI is the output directory. Use any path you like — inside or outside your project.

---

## I have more questions

[Create an issue](https://github.com/pmcelhaney/counterfact/issues) — questions are welcome.

---

## See also

- [Getting started](./getting-started.md)
- [API reference](./api.md)
- [How it compares](./comparison.md)
- [Find your workflow](./usage.md)
