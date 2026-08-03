# Share State Across API Groups

Model one product across several OpenAPI groups without coupling one group's
routes to another group's context tree.

## Why teams use this

Counterfact normally gives each API group its own context registry. That is the
right default for unrelated APIs, but a multi-service workflow may need a few
shared facts: an order references a known customer, an invoice references an
order, or several services observe the same simulated account status.

Reaching into another group's context would make domain logic depend on that
group's route layout. A shared store gives the simulator one application-level
home for cross-group data and invariants while each group keeps its own local
contexts. Keep that model smaller than the real product domain: include only
facts and transitions that a supported client workflow observes.

## How it works

Add one user-authored `_.store.ts` at the root of `basePath`:

```text
api/
  _.store.ts
  customers/
    routes/
      _.context.ts
      customers.ts
  orders/
    routes/
      _.context.ts
      orders.ts
```

The module must export a zero-argument `Store` class. Counterfact constructs one
store for each simulator instance and passes it only to context constructors as
`$.store`. Route handlers continue to use their nearest `$.context`.

## Example

Put shared entities and cross-group rules in the store:

```ts
// api/_.store.ts
interface Customer {
  id: string;
  name: string;
}

interface Order {
  id: string;
  customerId: string;
}

export class Store {
  readonly customers = new Map<string, Customer>();
  readonly orders = new Map<string, Order>();

  createOrder(order: Order): Order {
    if (!this.customers.has(order.customerId)) {
      throw new Error(`Unknown customer: ${order.customerId}`);
    }

    this.orders.set(order.id, structuredClone(order));
    return structuredClone(order);
  }
}
```

Each group wraps the shared store with its own route-facing context API. The
generated `Context$` type imports the concrete `Store` type from `_.store.ts`:

```ts
// api/customers/routes/_.context.ts
import type { Context$ } from "../types/_.context.js";

export class Context {
  private readonly store: Context$["store"];

  constructor($: Context$) {
    this.store = $.store;
  }

  addCustomer(customer: { id: string; name: string }) {
    this.store.customers.set(customer.id, structuredClone(customer));
    return structuredClone(customer);
  }
}
```

```ts
// api/orders/routes/_.context.ts
import type { Context$ } from "../types/_.context.js";

export class Context {
  private readonly store: Context$["store"];

  constructor($: Context$) {
    this.store = $.store;
  }

  createOrder(order: { id: string; customerId: string }) {
    return this.store.createOrder(order);
  }
}
```

Handlers stay small and do not receive the store directly:

```ts
// api/orders/routes/orders.ts
export const POST: HTTP_POST = ($) =>
  $.response[201].json($.context.createOrder($.body));
```

## Inspect and seed the shared state

When the store exists, the REPL exposes the same live object as `store`:

```js
store.customers.size;
store.orders.clear();
```

The programmatic API also exposes it. Supply the store type explicitly when you
want typed access from a test or setup script:

```ts
import { counterfact } from "counterfact";
import type { Store } from "./api/_.store.js";

const simulator = await counterfact<Store>(config, specs);

if (simulator.store === undefined) {
  throw new Error("Expected api/_.store.ts");
}

simulator.store.customers.set("customer-1", {
  id: "customer-1",
  name: "Ada",
});
```

Scenario arguments deliberately do not receive `store`; seed it through the
programmatic API, the REPL, or methods exposed by a group's context.

## Reload behavior

The store lives for the lifetime of the simulator returned by `counterfact()`.
A stop/start cycle preserves it, while a new simulator receives a fresh store.

On a successful store-module reload, Counterfact preserves the live object's
identity and existing fields, updates prototype methods, and adds newly declared
enumerable fields. It never overwrites or removes existing fields automatically.
If a later edit is invalid or the file is deleted, the running simulator keeps
the last good store and reports the reload failure.

Use prototype methods and ordinary instance fields for reloadable store code.
ECMAScript `#private` fields are not compatible with prototype replacement.

## What you get

- All API groups observe the same live domain state when the simulator opts in.
- Cross-group invariants have one explicit owner instead of being scattered
  across route handlers.
- Group-local contexts and `loadContext(path)` keep their existing boundaries.
- Projects without `<basePath>/_.store.ts` retain isolated group state and their
  existing behavior.

## Keep exploring

- [Model the Workflow, Not the Backend](./model-the-workflow.md) — decide
  whether cross-group state is necessary before introducing a store
- [Federated Context Files](./federated-context.md) — keep state local when the
  collaborating routes are in one API group
- [Test the Context, Not the Handlers](./test-context-not-handlers.md) — unit-test
  the context methods that wrap store behavior
- [Automated Integration Tests](./automated-integration-tests.md) — verify
  cross-group workflows through real HTTP requests
- [Live Server Inspection with the REPL](./repl-inspection.md) — inspect and
  mutate live simulator state interactively
- [State](../features/state.md) — context and store lifecycle reference
