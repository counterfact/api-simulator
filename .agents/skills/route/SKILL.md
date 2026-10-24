---
name: route
description: >
  Edit Counterfact route files to add endpoint behavior while keeping handlers
  thin and delegating business logic to context classes.
applyTo:
  - "**/routes/**/*.{ts,js}"
---

# Route Skill

## Purpose

Implement or update route behavior in generated route files.

## Required rules

- Always prefer function expressions with a block body and explicit `return`
  for route handlers: `export const GET: HTTP_GET = function ($) { ... };`.
- Annotate the exported constant with the generated handler type so TypeScript
  infers `$` and checks that the handler returns a completed response. Preserve
  the full handler type, not just its parameter type. Do not annotate `$`
  separately or disable `noImplicitAny`.
- Preserve `async` as `async function ($)` when the handler uses `await`.
- Convert generated arrow-function handlers to this form when editing them.

- Use the `$` API in every handler (`$.path`, `$.query`, `$.body`, `$.response`,
  `$.context`).
- Cross-context access belongs in context methods: inject the generated
  `Context$` into the context constructor and use its `loadContext` helper.
  Route handler arguments do not expose `loadContext`.
- Route handlers must stay thin.
- Business logic must be delegated to a context class in an appropriate
  `_.context.ts` file.
- Do **not** create unit tests in this skill; routes are HTTP adapters and
  behavior should be validated through context tests and black-box/integration
  flows when available.

## Step-by-step

1. Open the target file under `routes/` (e.g. `routes/pet/{petId}.ts`).
2. Read input using `$` (`$.path`, `$.query`, `$.body`).
3. Call a context method for logic/state changes.
4. Return a response using `$.response.status(status)`.
5. If needed, add new context methods instead of embedding logic in the route.

## Pattern

```ts
export const POST: HTTP_POST = function ($) {
  const created = $.context.createThing($.body);
  return $.response.status(201).json(created);
};
```

## References

- https://counterfact.dev/docs/features/state.html
- `packages/runtime/src/server/dispatcher.ts` for runtime handler behavior
