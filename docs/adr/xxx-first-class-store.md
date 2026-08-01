# ADR xxx: First-Class Shared Store

## Status

Proposed

## Context

Counterfact now hosts multiple OpenAPI groups in one server, but a group is a
state boundary. Each group receives its own `ContextRegistry`; only versioned
specifications in the same group share one. That protects unrelated APIs, but
it leaves a simulator that models a coherent multi-service product with no
supported place to keep shared domain state.

Context authors can use the existing `$.loadContext(path)` constructor helper
inside an API group, yet they cannot safely use it to cross group boundaries.
Sharing a root route context by convention would conflate URL-scoped state with
product-domain state, create generated-code ownership ambiguity, and make an
incidental folder layout part of the simulator’s domain model.

The detailed contract is in [the shared-store specification](../specifications/shared-store.md).

## Decision

Introduce an opt-in, application-level shared store. A simulator opts in by
providing a user-authored `<basePath>/_.store.ts`, and Counterfact constructs one
typed live instance for each simulator returned by `counterfact()`. Context
constructors in all groups access that instance as `$.store`; route handlers
continue to access domain behavior through their nearest `$.context`. The same
store is also available directly in the REPL and programmatic API.

The store is constructed before route contexts, remains stable across hot reload
and stop/start cycles of the same simulator, and is not shared with another
simulator in the same process. It owns cross-resource domain data, invariants,
and initial domain state. Route contexts remain responsible for path- or
API-local behavior.

The conventional path is watched even when absent. Adding `_.store.ts` to a
running watched simulator activates the store, reloads contexts with the new
constructor argument, and regenerates context types. Removing or breaking a
previously loaded module retains the last good live store for that simulator;
a new simulator without the file starts with the feature disabled.

## Options

### Option A: Share one root route context across all groups

Make every group use a common root `routes/_.context.ts`.

- **Pro:** Small runtime change and familiar existing API.
- **Con:** Couples the shared domain model to generated route layout, causes
  ownership/type collisions, and prevents a group from having an independent
  root context.

### Option B: Let handlers reach other groups’ contexts directly

Extend `$.loadContext()` with group-qualified paths.

- **Pro:** Reuses an existing mechanism and preserves each group’s local
  context class.
- **Con:** Makes route handlers depend on another group’s implementation and
  URL/path layout; shared invariants become scattered across handlers.

### Option C: First-class shared store (chosen)

Add a conventionally located, server-level store exposed to context constructors
as `$.store` and directly through the REPL and programmatic API.

- **Pro:** Expresses a product-domain boundary directly; gives all groups a
  typed, stable collaboration point; preserves group isolation by default.
- **Con:** Adds lifecycle, generator, REPL, and reload responsibilities that
  must be tested together.

### Option D: External persistence only

Require simulators to share a database, file, or service outside Counterfact.

- **Pro:** Supports cross-process state and avoids new runtime primitives.
- **Con:** Adds operational setup, slows the development loop, and abandons
  Counterfact’s resettable in-memory-state model for a common simulator need.

## Consequences

- Multi-service simulators can model coherent entities and enforce references
  across API groups.
- Existing simulators stay backward compatible and group-isolated unless they
  add `<basePath>/_.store.ts`.
- The runtime needs a dedicated store loader that preserves the live instance,
  updates its prototype on successful reload, and adds new fields without
  overwriting existing domain data.
- The store watcher must observe the conventional path even before it exists,
  coordinate context reloads when a store is first added, and trigger context
  type regeneration when type watching is enabled.
- When `<basePath>/_.store.ts` exists, the generator must add a typed `$.store`
  to every group's context constructor types without changing operation,
  middleware, or scenario types.
- Integration tests must exercise cross-group behavior through real HTTP, and
  unit tests must cover the store lifecycle independently.

## Advice

- Put business rules that refer to more than one API group in the store. Expose
  those rules to handlers through their route contexts, and keep request parsing
  and operation-specific response mapping in route handlers.
- Do not introduce external persistence as part of this feature. A newly
  constructed simulator remains a clean state even when another simulator
  exists in the same process.
- Do not use a store as a shortcut for unrelated API groups to share arbitrary
  implementation details; its API should describe the simulated product domain.
- Preserve the current path-scoped context API without qualification. Add
  cross-group access only through the store surface unless a later, separate
  ADR establishes another use case.
