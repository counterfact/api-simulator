# Federated Context Files

Keep state for users, orders, payments, and other domains close to the routes that use it, without turning the whole mock into one unmanageable class.

## Why teams use this

Placing one `_.context.ts` at the root of the routes tree is convenient at first, but it accumulates all state for all domains in one object. Unrelated concerns become entangled: the `UserContext` knows about payment flags, the payment logic reaches into user fields, and the class grows until it is hard to understand or test in isolation.

## How it works

Place a `_.context.ts` file at each domain boundary. Each subtree owns its context and is responsible only for its own state and logic. When a route in one subtree needs data from another, use `$.loadContext(path)` to reach across the boundary — without merging the two contexts into one.

This keeps each context class small, focused, and independently testable. The `_.context.ts` file nearest to a handler wins; a handler under `/payments` uses the payments context, not the root context.

## Example

Give each domain its own context:

```ts
// api/routes/users/_.context.ts
import type { User } from "../../types/components/user.types.js";

export class Context {
  private users = new Map<number, User>();
  private nextId = 1;

  add(data: Omit<User, "id">): User {
    const user = { ...data, id: this.nextId++ };
    this.users.set(user.id, user);
    return user;
  }

  getById(id: number): User | undefined {
    return this.users.get(id);
  }
  list(): User[] {
    return [...this.users.values()];
  }
}
```

```ts
// api/routes/payments/_.context.ts
import type { Payment } from "../../types/components/payment.types.js";

export class Context {
  private payments = new Map<string, Payment>();

  record(payment: Payment): void {
    this.payments.set(payment.id, payment);
  }
  getById(id: string): Payment | undefined {
    return this.payments.get(id);
  }
  list(): Payment[] {
    return [...this.payments.values()];
  }
}
```

When a payment route needs to enrich a response with user data, it loads the users context by path:

```ts
// api/routes/payments/{paymentId}.ts
import type { Context as UsersContext } from "../../users/_.context.js";

export const GET: HTTP_GET = ($) => {
  const payment = $.context.getById($.path.paymentId);
  if (!payment) return $.response[404].text("Payment not found");

  const usersContext = $.loadContext("/users") as UsersContext;
  const user = usersContext.getById(payment.userId);

  return $.response[200].json({ ...payment, user });
};
```

The `loadContext(path)` call returns the live context instance rooted at that path. The two contexts remain independent classes; neither imports from the other's module.

## What you get

- Each context class has a single responsibility and a clear boundary; it is easier to understand and unit-test in isolation.
- `loadContext()` makes cross-domain dependencies explicit at the call site — the reader can immediately see which domain the route depends on.
- The type cast (`as UsersContext`) is required because `loadContext()` returns `unknown`; consider co-locating a typed helper if cross-domain calls are frequent.
- Contexts are still shared within a subtree: all routes under `/payments` share the same payments context instance.

## Keep exploring

- [Share State Across API Groups](./shared-store.md) — use an application-level store when collaborating routes belong to different API groups
- [Test the Context, Not the Handlers](./test-context-not-handlers.md) — unit-test each context class independently
- [Mock APIs with Dummy Data](./mock-with-dummy-data.md) — the pattern that introduces the single-context approach this one extends
- [Live Server Inspection with the REPL](./repl-inspection.md) — inspect each domain's context live from the REPL
