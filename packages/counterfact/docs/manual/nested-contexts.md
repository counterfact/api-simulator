# Nested and connected contexts

Use nested contexts when separate route areas need their own state or behavior. A route uses the nearest `_.context.ts` in its directory or a parent directory.

## Divide state by route subtree

For example, put pet behavior in `routes/pets/_.context.ts` and user behavior in `routes/users/_.context.ts`. A handler in `routes/pets/{petId}.ts` sees the pet context as `$.context`.

## Connect contexts explicitly

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
import type { Context$ } from "../../types/_.context.js";

export class Context {
  private payments = new Map<string, Payment>();
  private loadContext: Context$["loadContext"];

  constructor($: Context$) {
    this.loadContext = $.loadContext;
  }

  getWithUser(id: string) {
    const payment = this.getById(id);
    if (!payment) return undefined;
    const user = this.loadContext("/users").getById(payment.userId);
    return { ...payment, user };
  }

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

The payments context uses the injected helper when a request needs user data. Looking it up inside `getWithUser` avoids depending on context initialization order. The route delegates to that method:

```ts
// api/routes/payments/{paymentId}.ts
import type { HTTP_GET } from "../../types/paths/payments/{paymentId}.types.js";

export const GET: HTTP_GET = function ($) {
  const payment = $.context.getWithUser($.path.paymentId);
  if (!payment) return $.response.status(404).text("Payment not found");
  return $.response.status(200).json(payment);
};
```

This example assumes `Payment` has string `id` and numeric `userId`, and the GET operation declares the enriched JSON response and a text `404` response. Regenerate types after adding the context files so `Context$` has a typed `loadContext("/users")` overload.

The helper returns the live context nearest to the requested path. It is available to context constructors and scenarios; the REPL exposes it as `loadContext(path)`. Handler arguments do not expose `loadContext`, so cross-domain logic belongs in an authored context method. The two contexts remain independent classes.

## Choose a shared store for API groups

Contexts in separate API groups have separate registries. Use the [shared application store](../patterns/shared-store.md) when those groups represent one product and need the same domain data.

Context references survive ordinary hot reload. After an explicit simulator reset, reacquire them with `api.loadContext()`; previously held references belong to the old state. See [stateful contexts](../features/state.md) and [lifecycle reference](../api/simulator.md).
