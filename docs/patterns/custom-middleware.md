# Custom Middleware

Apply authentication, headers, logging, and other cross-cutting behavior once, across the routes that need it.

## Why teams use this

Handlers are a poor place for cross-cutting concerns. Adding an auth check, a CORS header, or a request log to every handler creates duplication, makes the handlers harder to read, and means that a new route will silently miss the concern unless the author remembers to add it.

## How it works

Drop a `_.middleware.ts` file into any directory in the routes tree. It exports a standard Koa middleware function that applies to all routes in that subtree. Handlers in the subtree receive the request only after the middleware has run, so a rejected request never reaches a handler.

Place middleware close to the routes it governs. A `_.middleware.ts` at the root applies everywhere. One under `routes/admin/` applies only to admin endpoints.

## Example

### Authentication gate

Reject unauthenticated requests before any handler runs:

```ts
// routes/_.middleware.ts
import type { Middleware } from "koa";

const middleware: Middleware = async (ctx, next) => {
  if (!ctx.headers.authorization) {
    ctx.status = 401;
    ctx.body = "Unauthorized";
    return;
  }
  await next();
};

export default middleware;
```

All routes now require an `Authorization` header. A missing header returns `401` immediately — no handler is called.

### Adding response headers

Attach headers to every response in a subtree — useful for simulating CORS, rate-limit headers, or tracing identifiers:

```ts
// routes/_.middleware.ts
import { randomUUID } from "node:crypto";
import type { Middleware } from "koa";

const middleware: Middleware = async (ctx, next) => {
  await next();
  ctx.set("x-ratelimit-limit", "1000");
  ctx.set("x-ratelimit-remaining", "999");
  ctx.set("x-request-id", randomUUID());
};

export default middleware;
```

### Request logging

Log every request and its response status without touching any handler:

```ts
// routes/_.middleware.ts
import type { Middleware } from "koa";

const middleware: Middleware = async (ctx, next) => {
  const start = Date.now();
  await next();
  const elapsed = Date.now() - start;
  console.log(`${ctx.method} ${ctx.path} → ${ctx.status} (${elapsed}ms)`);
};

export default middleware;
```

### Scoped middleware

Apply middleware only to a specific domain. The `_.middleware.ts` under `routes/admin/` fires for admin routes only; all other routes are unaffected:

```ts
// routes/admin/_.middleware.ts
import type { Middleware } from "koa";

const middleware: Middleware = async (ctx, next) => {
  const token = ctx.headers["x-admin-token"];
  if (token !== "super-secret") {
    ctx.status = 403;
    ctx.body = "Forbidden";
    return;
  }
  await next();
};

export default middleware;
```

## What you get

- Middleware applies automatically to every new route added to the subtree — no per-handler boilerplate is required.
- A single `_.middleware.ts` at the routes root applies to all paths; placing it in a subdirectory scopes it to that domain.
- Handlers remain focused on response logic; authentication, headers, and logging live in a separate file.
- Middleware runs in Koa's standard onion model — you can add logic before `next()` (pre-processing) and after (post-processing).

## Keep exploring

- [Simulate Failures and Edge Cases](./simulate-failures.md) — middleware can reject or modify requests without touching handlers
- [Federated Context Files](./federated-context.md) — the same directory-scoping model applies to both context files and middleware files
- [Reference Implementation](./reference-implementation.md) — add middleware to replicate the authentication and header behavior of the real API
