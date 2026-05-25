# FAQ

Everything you want to know before you commit to using Counterfact.

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

Yes — that's the point. A generated route is just a function. You can write real logic in it:

```ts
export const POST: HTTP_POST = ($) => {
  if (!$.body.name) return $.response[400].text("name is required");
  const pet = $.context.add($.body);
  return $.response[200].json(pet);
};
```

POST data and GET it back. Enforce validation. Simulate business rules. The server behaves like a real API because under the hood it is one, just running locally with TypeScript files you control.

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

  get(id: number) { return this.orders.get(id); }
  list() { return [...this.orders.values()]; }
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
⬣> .proxy off               # mock everything
```

---

## How does type safety work?

Every route handler type is generated from the spec. When you call `.json(...)` on a response builder, TypeScript checks that the object you pass matches the schema defined in the spec. When the spec changes and you regenerate, TypeScript surfaces every handler that no longer matches — before any request fails.

OpenAPI descriptions are preserved as JSDoc comments on the generated types, so they appear inline in your editor as you type.

---

## Does it validate incoming requests?

Yes, by default. Requests that don't match the schema defined in the spec return a `400` automatically. Disable this with `--no-validate-request` if you need looser behavior.

---

## Does it validate outgoing responses?

Yes, by default. Response headers are validated against the schema defined in the spec. Any validation errors (missing required headers or type mismatches) are reported as `response-type-error` HTTP response headers — one header per error; multiple headers with the same name are allowed. The response body is still returned normally — the errors are advisory only. Disable this with `--no-validate-response` if you need looser behavior.

---

## What OpenAPI versions are supported?

OpenAPI 3.x. Swagger 2 (OAS2) is not currently supported.

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

---

## Can I use it programmatically (not via the CLI)?

Yes. Import `counterfact` and pass a `Config` object:

```ts
import { counterfact } from "counterfact";

const { start } = await counterfact({
  openApiPath: "openapi.yaml",
  basePath: "api",
  port: 4000,
  startServer: true,
  startRepl: false,
  generate: { routes: false, types: false },
  watch: { routes: false, types: false },
  alwaysFakeOptionals: false,
  buildCache: false,
  proxyPaths: new Map(),
  proxyUrl: "",
  prefix: "",
  validateRequests: true,
  validateResponses: true,
});

const { stop } = await start({
  startServer: true,
  generate: { routes: false, types: false },
  watch: { routes: false, types: false },
  buildCache: false,
});
```

This makes Counterfact easy to embed in test setups — start a server in `beforeAll`, stop it in `afterAll`, and run real HTTP requests against it in your tests. See the [Programmatic API guide](./features/programmatic-api.md) for a complete example.

---

## Can I add custom middleware?

Yes. Drop a `_.middleware.ts` file anywhere in the routes tree. It receives a standard Koa middleware function and applies to all routes in that subtree:

```ts
// routes/_.middleware.ts
import type { Middleware } from "koa";

const middleware: Middleware = async (ctx, next) => {
  if (!ctx.headers.authorization) {
    ctx.status = 401;
    return;
  }
  await next();
};

export default middleware;
```

---

## What's with these `never` types in the generated code?

If you see `query: never` in a types file it means the OpenAPI spec doesn't define any query parameters for that operation. TypeScript will flag `$.query.anything` as a type error — by design. If the spec is incomplete, fix it at the source.

---

## Do I need to restart after changing a routes file?

No. Counterfact watches the routes directory and hot-reloads changed files immediately. Your in-memory context is preserved across reloads.

---

## When do I need to restart?

If your OpenAPI spec is a remote URL, Counterfact only fetches it once at startup. To pick up spec changes you need to restart (or use a local copy and `--watch`). If your spec is a local file, Counterfact watches it and regenerates types automatically — no restart required.

---

## Where does the generated code go?

Wherever you tell it. The second argument to the CLI is the output directory. Use any path you like — inside or outside your project.

---

## I have more questions

[Create an issue](https://github.com/pmcelhaney/counterfact/issues) — questions are welcome.

---

## See also

- [Getting started](./getting-started.md)
- [Patterns](./patterns/index.md)
- [Reference](./reference.md)
- [How it compares](./comparison.md)
- [Usage](./usage.md)
