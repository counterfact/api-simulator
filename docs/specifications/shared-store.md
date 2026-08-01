# Shared Store Specification

## Status

Proposed.

## Purpose

Counterfact SHALL support one optional, application-level **store** that is
shared by every API group in a server instance. It gives a simulator a single
home for domain data and rules that span independently generated OpenAPI groups,
while preserving the existing path-scoped `$.context` abstraction.

The store is in-memory and survives route and context-module hot reloads for the
life of one simulator instance returned by `counterfact()`. It does not persist
across construction of a new simulator instance or a process restart. Two
simulators created in the same process receive different store instances.

## Non-goals

- Persisting simulator state to disk or an external database.
- Replacing per-route and per-subtree `$.context` instances.
- Automatically inferring relationships from OpenAPI documents.
- Providing distributed transactions, locking, or multi-process sharing.
- Making API groups share state unless the simulator opts in.
- Supporting several stores in the initial release.
- Automatically migrating or replacing existing store fields when their
  initializers change.

## Layout and discovery

An opt-in simulator places one user-authored store module at the root of
`config.basePath`:

```text
<basePath>/
  _.store.ts
  customers/
  orders/
```

The presence of `<basePath>/_.store.ts` opts the simulator into the shared
store; no configuration key is required. The file MUST export a constructable
`Store` class. `counterfact()` loads the module and constructs exactly one
instance before loading route contexts, so the instance is available to every
context constructor and on the object returned by `counterfact()`. Calling
`start()`, `stop()`, and then `start()` again on the same simulator does not
reconstruct or reset the store. Constructing a new simulator constructs a fresh
store.

Discovery is not limited to initial startup. When server watching starts,
Counterfact MUST watch the exact `<basePath>/_.store.ts` path even when the file
does not yet exist. Creating a valid store module activates the feature for the
running simulator: Counterfact constructs the store, exposes it through the
simulator object and REPL, and reloads every route context module so its
constructor receives `$.store` while existing context state remains subject to
the normal `ContextRegistry` preservation rules.

Single-spec projects and multi-spec projects without `<basePath>/_.store.ts`
retain their current behavior and receive no new required files.

## Context API

For an enabled simulator, every route context constructor receives the store
through its existing context argument:

```ts
$.store;
```

It is the live instance exported by `<basePath>/_.store.ts`, with its concrete
type exposed to TypeScript. The existing `$.loadContext(path)` and
`$.readJson(path)` context-constructor helpers retain their current behavior.
`$.loadContext(path)` continues to address contexts within the context's API
group.

For example, two independently generated groups can enforce a shared
relationship through their own route contexts without importing each other’s
contexts:

```ts
// _.store.ts
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

// orders/routes/_.context.ts
import type { Context$ } from "../types/_.context.js";

export class Context {
  private readonly store: Context$["store"];

  constructor($: Context$) {
    this.store = $.store;
  }

  createOrder(order: Order): Order {
    return this.store.createOrder(order);
  }
}

// orders/routes/orders.ts
export const POST: HTTP_POST = ($) =>
  $.response[201].json($.context.createOrder($.body));
```

Counterfact MUST generate the store type into every API group’s context
constructor type when `<basePath>/_.store.ts` exists. Each generated context
type imports `Store` directly from that module using a relative, `.js`-suffixed
type-only import. Generated files MUST remain regenerated artifacts. The store
MUST NOT be added directly to operation, middleware, or scenario arguments.

Initial type generation detects whether the conventional module exists. While
type watching is enabled, successfully creating the module MUST regenerate all
groups' context constructor types to add `$.store`. Changes to the exported
`Store` type flow through the generated type-only imports without copying the
user-authored type into generated files.

## REPL

In a multi-API REPL, `store` exposes the same live object. This is additive to
the existing group-keyed `context`, `loadContext`, and `routes` surfaces. In a
single-API REPL, the new `store` binding is also available when the store module
exists.
Scenario arguments retain their existing shape and do not receive the store.

## Reload and failure behavior

- Route and normal context hot reload MUST continue to preserve their existing
  in-memory state.
- On a successful reload, Counterfact MUST preserve the live store object's
  identity and replace its prototype with the newly loaded `Store.prototype`.
  This updates prototype methods without reconstructing the live store.
- Counterfact MUST construct a temporary candidate from the newly loaded class.
  Each enumerable own field present on the candidate but absent from the live
  store is copied to the live store. Existing own fields are never overwritten
  or deleted during automatic reload, even when their initializer changed or
  was removed from the source module. This preserves live domain data and makes
  newly added fields available deterministically.
- Store authors MUST use prototype methods and ordinary own fields for
  reloadable behavior and state. ECMAScript `#private` fields, symbol-keyed
  fields, non-enumerable instance fields, and mutable static state are outside
  the reload contract. In particular, methods loaded from a new class cannot
  safely access private fields branded by an older class definition.
- If an initial store module exists but does not export a constructable `Store`,
  or throws while loading or constructing, `counterfact()` MUST reject with an
  error containing the absolute module path and underlying error. An absent
  module disables the feature and is not an error.
- If a previously successful store module later becomes invalid, throws, or is
  deleted, Counterfact MUST keep the last successfully loaded prototype and live
  store. It MUST print an actionable diagnostic to standard error containing
  the absolute module path and underlying error, and continue serving requests.
  A failed reload MUST NOT substitute a new empty store or partially apply the
  candidate module.
- Deleting the module does not deactivate the store in the current simulator;
  it is handled as a failed runtime reload and the last good object remains
  live. When type watching is enabled, however, Counterfact MUST regenerate
  context types without `$.store` because the source module that supplied the
  `Store` type no longer exists. A newly constructed simulator also sees the
  module as absent and disables the feature. Runtime retention is a resilience
  guarantee, not a claim that deleted source remains type-checkable.

## Programmatic API

When `<basePath>/_.store.ts` exists, the promise returned by `counterfact()`
resolves with the live store alongside the existing primary `contextRegistry`:

```ts
import type { Store } from "./_.store.js";

const simulator = await counterfact<Store>(config, specs);
const { stop } = await simulator.start(config);

if (simulator.store === undefined) {
  throw new Error("Expected _.store.ts to be loaded");
}

simulator.store.seed(/* ... */);
await stop();
```

The programmatic signature is `counterfact<TStore = unknown>(...)`, and its
return type includes `store?: TStore`. A caller supplies the generic argument
when it wants the concrete user-authored type. Counterfact can discover the
module and regenerate project files, but the published TypeScript declaration
for the general-purpose `counterfact()` function cannot infer a caller-local
type from filesystem state. The return property is initially omitted when the
store module does not exist and is added if a valid module is later discovered
while watching. It is not a second context registry: once constructed, its
identity is stable for the simulator instance's lifetime and it is usable before
`start()` when discovered during initial construction.

## Required validation

The implementation MUST verify the following:

1. Two different API groups observe mutations made through the same store using
   real HTTP requests.
2. Existing multi-spec groups remain isolated when `_.store.ts` is absent.
3. A store reload preserves existing data while exposing updated methods.
4. A store reload adds newly declared fields without overwriting or deleting
   existing fields.
5. Generated context constructor types expose the concrete store type, while
   generated operation, middleware, and scenario types do not.
6. The REPL and programmatic API expose the same live store used by contexts.
   The programmatic generic types the store without making it non-optional.
7. An invalid initial store module rejects `counterfact()` with the absolute
   path and underlying error, while an absent module leaves the feature
   disabled.
8. Deleting or breaking a previously loaded store module retains the last good
   live store and reports the failed reload to standard error.
9. CLI and programmatic use both discover only `<basePath>/_.store.ts`; no
   store-location configuration is accepted.
10. Two simulator instances in one process receive independent stores, while a
    stop/start cycle on one instance preserves its store.
11. Store access from middleware, operation, and scenario arguments remains
    absent at both runtime and compile time.
12. A group startup-scenario failure after store initialization releases active
    watchers and leaves the configured HTTP port unopened.
13. Existing single-API behavior is unchanged when `_.store.ts` is absent.
14. Creating `_.store.ts` while watching activates the store, updates the
    simulator object and REPL, reloads contexts without losing their state, and
    regenerates every group's context constructor type.
15. Deleting a loaded store retains the running simulator's live object but
    removes `$.store` from watched context types; constructing a new simulator
    without the file disables the feature.
