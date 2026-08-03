# Design Principles

These are the guiding principles behind Counterfact's design. When making architectural decisions or evaluating trade-offs, consult this list.

---

## Principle of Least Surprise

The system should behave in ways that developers intuitively expect. Naming, behavior, and interfaces should be consistent with common conventions in the Node.js and TypeScript ecosystems. When something unexpected happens, provide a clear, actionable error message.

## Easy Things Should Be Easy, Hard Things Should Be Possible

> "Easy things should be easy, hard things should be possible." — Larry Wall

Running `npx counterfact openapi.yaml` should get a developer to a working mock server with zero configuration. Advanced use cases — custom middleware, fine-grained proxy control, MSW integration — must also be supported, even if they require more effort.

## Speed Is Important

Startup time matters. Hot-reload latency matters. Response time matters. Every interaction in a developer's inner loop compounds; slow tools erode productivity. Prefer solutions that keep the feedback loop fast.

## Simulate Deliberately, Not Faithfully

Counterfact should make client workflows predictable, not reproduce a real
backend. Deterministic handlers are the default. Contexts, stores, scenarios,
and the REPL make selected cross-request behavior possible, but the authored
state model should remain smaller and simpler than production. Prefer explicit,
client-visible states over databases, background work, and internal service
architecture.

## Make Restarting the Server Unnecessary

Changes to route files, type files, and context files should take effect immediately without restarting the server. Hot-reloading and file watching are first-class concerns. Avoid designs that require a restart to pick up changes.

## Degrade Gracefully Without Breaking

When something is misconfigured, missing, or partially broken, Counterfact should keep running as best it can. A single bad route file should not crash the entire server. A missing OpenAPI spec should produce helpful output rather than a fatal error. The system should always do _something_ useful.

## Type Safety as a Feature, Not a Burden

Route handlers are typed directly from the OpenAPI specification. This means TypeScript catches contract violations at edit time rather than at runtime. Keep generated types accurate and ergonomic so developers benefit from type checking without fighting it.

## Separation of Concerns

The code generator, server, REPL, transpiler, and proxy are independent components that cooperate through well-defined interfaces. Each component can be understood, tested, and replaced in isolation. Avoid tight coupling between subsystems.

## The OpenAPI Spec Is the Source of Truth

Generated types and route scaffolding are derived from the OpenAPI specification. When the spec changes, the system should update. Manual changes to generated _type_ files are never necessary; manual changes to generated _route_ files (business logic) are encouraged and preserved across regenerations.
