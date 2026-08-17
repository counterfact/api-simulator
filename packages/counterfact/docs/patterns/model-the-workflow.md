# Model the Workflow, Not the Backend

Give clients the stateful behavior a workflow needs without rebuilding the
service behind the API.

## Why teams use this

Predictability is one of the main benefits of a simulated API. A handler that
always returns the same response for the same input is easy to understand,
debug, and test. Some workflows need more: a client creates a record and reads
it later, an approval changes what the next request returns, or a scenario
temporarily enables a failure.

It is tempting to respond by copying the real backend's data model, lifecycle,
and business rules. That makes the simulator slower to build and harder to
reset, while still leaving it less trustworthy than the real service. The
simulator becomes a second backend that the team must maintain.

## How it works

Model the smallest observable state machine that supports the client workflow:

1. Start with a fixed response or a deterministic function of the request.
2. Add context state only when a later request must observe an earlier action.
3. Add a shared store only when separate API groups must observe the same fact.
4. Use scenarios to establish named, repeatable starting states.
5. Use the REPL to inspect or temporarily steer the current state while
   developing.

The state represents facts the client needs to observe, not the backend's
tables, queues, caches, jobs, or internal service boundaries. Prefer an explicit
flag or a short collection over infrastructure that reproduces how production
arrives at the same response.

## Example

A payment workflow may need only an outcome flag and a small set of placed
orders:

```ts
// api/routes/_.context.ts
export class Context {
  paymentOutcome: "approved" | "declined" = "approved";
  private orders = new Set<string>();

  placeOrder(id: string): "placed" | "declined" {
    if (this.paymentOutcome === "declined") return "declined";
    this.orders.add(id);
    return "placed";
  }

  hasOrder(id: string): boolean {
    return this.orders.has(id);
  }

  reset(): void {
    this.paymentOutcome = "approved";
    this.orders.clear();
  }
}
```

This is enough to simulate create, read, decline, and reset. It does not need a
payment ledger, asynchronous settlement, inventory reservations, or the real
service's retry rules unless a client workflow specifically depends on one of
those behaviors.

Make important starting states explicit with scenarios:

```ts
// api/scenarios/index.ts
import type { Scenario } from "../types/_.context.js";

export const startup: Scenario = ($) => $.context.reset();

export const declinedPayment: Scenario = ($) => {
  $.context.reset();
  $.context.paymentOutcome = "declined";
};
```

During development, the same state is available as a direct control surface:

```text
⬣> .scenario declinedPayment
⬣> context.paymentOutcome = "approved"
```

## What you get

- Deterministic behavior by default, with state only where continuity matters.
- A small model that is easy to understand, reset, and commit with the client.
- Named scenarios that reproduce relevant API worlds without production data.
- Clear reasons to keep targeted tests against the real backend: the simulator
  intentionally does not prove unmodeled behavior.

A useful test is: if removing a piece of state would not change anything the
client can observe in a supported workflow, leave it out. If the simulator
needs migrations, background workers, or a production-shaped database, first
consider whether a fixed outcome, context flag, or scenario can express the
same client-visible behavior.

## Keep exploring

- [Mock APIs with Dummy Data](./mock-with-dummy-data.md) — begin with fixed and
  deterministic responses
- [Scenario Scripts](./scenario-scripts.md) — save repeatable starting states
- [Live Server Inspection with the REPL](./repl-inspection.md) — inspect and
  steer the current state
- [Share State Across API Groups](./shared-store.md) — introduce application-level
  state when a workflow crosses API groups
- [Hybrid Proxy](./hybrid-proxy.md) — use the real backend selectively when its
  behavior is the thing you need to exercise
