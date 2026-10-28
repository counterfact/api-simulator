# Nested and connected contexts

Use the [project installation setup](../patterns/lifecycle-setup.md) to run these examples with Counterfact 3 or newer.

Use nested contexts when separate route areas need their own state or behavior. A route uses the nearest `_.context.ts` in its directory or a parent directory.

## Divide state by route subtree

For example, put pet behavior in `routes/pets/_.context.ts` and user behavior in `routes/users/_.context.ts`. A handler in `routes/pets/{petId}.ts` sees the pet context as `$.context`.

## Connect contexts explicitly

This example assumes your OpenAPI document defines `components/schemas/User` with a numeric `id`, and `components/schemas/Payment` with a string `id` and numeric `userId`. Counterfact includes those schemas in `Schemas` even if no operation references them. The payment GET operation also declares the enriched JSON response and a text `404` response.

Give each domain its own context:

```ts
// api/routes/users/_.context.ts
import type { Schemas } from "../../types/index.js";

type User = Schemas["User"];

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
import type { Schemas } from "../../types/index.js";

type Payment = Schemas["Payment"];
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
import type { Routes } from "../../types/index.js";

export const GET: Routes["/payments/{paymentId}"]["GET"] = function ($) {
  const payment = $.context.getWithUser($.path.paymentId);
  if (!payment) return $.response.status(404).text("Payment not found");
  return $.response.status(200).json(payment);
};
```

Regenerate types after adding the context files so `Context$` has a typed `loadContext("/users")` overload.

The helper returns the live context nearest to the requested path. It is available to context constructors and scenarios; the REPL exposes it as `loadContext(path)`. Handler arguments do not expose `loadContext`, so cross-domain logic belongs in a context method you write. The two contexts remain independent classes.

## Choose a shared store for API groups

An [API group](./concepts.md#api-groups-versions-and-url-prefixes) is a configured collection of specs sharing code and state. A nested route directory remains inside its existing group. Contexts in separate groups have separate registries (collections of live contexts indexed by path). Use the [shared application store](../patterns/shared-store.md) when those groups represent one product and need the same domain data.

Context references survive ordinary hot reload. After an explicit simulator reset, reacquire them with `api.loadContext()`; previously held references belong to the old state. See [stateful contexts](../features/state.md) and [lifecycle reference](../api/simulator.md).
