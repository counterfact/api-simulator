# AI-Assisted Implementation

Turn a generated Counterfact project into useful behavior quickly, with an AI coding agent handling the repetitive first pass on your route logic.

## Why teams use this

Counterfact generates a working server immediately, but the handlers return random data. Writing realistic, stateful implementations for every route by hand is tedious, especially on large APIs.

## How it works

Delegate the implementation work to an AI coding agent. The combination of a simple, consistent handler API, TypeScript types derived from the spec, and one file per route gives AI agents the context they need to produce correct code with a small number of tokens and a low risk of hallucination. The agent can replace `.random()` calls one route at a time, guided by the type signatures already in place.

## Example

After generating the project, point an AI agent at a handler file and ask it to implement the route:

```
Given the TypeScript types in api/types/, implement the GET handler in api/routes/pet/{petId}.ts
to look up a pet from context by path parameter and return 200 with the pet or 404 if not found.
```

The agent sees the fully typed `$` parameter, the spec-derived response types, and the context definition — all in one file. It produces something like:

```ts
// api/routes/pet/{petId}.ts
export const GET: HTTP_GET = ($) => {
  const pet = $.context.get($.path.petId);
  return pet ? $.response[200].json(pet) : $.response[404].text("Not found");
};
```

If the result does not match the spec's response schema, TypeScript flags it immediately in the IDE. The agent can correct its output without requiring you to understand the full type system.

Repeat for each route, or ask the agent to implement all routes in a single pass. The clear file structure and isolated scopes minimize interference between routes.

## What you get

- The combination of type safety, one file per route, and a minimal handler API reduces the surface for AI hallucination.
- TypeScript provides immediate feedback when agent output does not conform to the spec; the developer does not need to run tests to catch structural errors.
- AI-generated implementations should be reviewed: type correctness does not guarantee behavioral correctness.
- The pattern works best when context types are already defined; ask the agent to implement the context before the route handlers.
- Unit-test the context class to keep shared logic reliable; handlers are intentionally thin and meant to be edited freely, so they do not need unit tests.

## Keep exploring

- [Explore a New API](./explore-new-api.md) — the starting point; AI implementation upgrades random responses to working ones
- [Test the Context, Not the Handlers](./test-context-not-handlers.md) — keep the context logic that the agent generates reliable and regression-proof
- [Mock APIs with Dummy Data](./mock-with-dummy-data.md) — the manual alternative when you need precise control over response content
- [Reference Implementation](./reference-implementation.md) — use the AI-generated handlers as the basis for a spec-conformant reference
