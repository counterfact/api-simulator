# AI-Assisted Implementation

Turn a generated Counterfact project into useful behavior quickly, with an AI coding agent handling the repetitive first pass on your route logic.

## Why teams use this

Counterfact generates a working server immediately, but the handlers return random data. Replacing the routes a workflow uses with deterministic or deliberately stateful behavior can be tedious, especially on large APIs.

## How it works

Delegate the implementation work to an AI coding agent. Generated TypeScript contracts and one file per route make the expected inputs and response shapes explicit. They constrain checked code, while explicit workflow instructions and HTTP tests establish the intended behavior; they do not guarantee correct agent output or a particular token cost. The agent can replace `.random()` calls one route at a time, guided by the type signatures already in place.

## Example

After generating the project, point an AI agent at a handler file and ask it to implement the route:

```
Given the TypeScript types in api/types/, implement the GET handler in api/routes/pet/{petId}.ts
to look up a pet from context by path parameter and return 200 with the pet or 404 if not found.
```

The agent sees the fully typed `$` parameter, the spec-derived response types, and the context definition — all in one file. It produces something like:

```ts
// api/routes/pet/{petId}.ts
export const GET: HTTP_GET = function ($) {
  const pet = $.context.get($.path.petId);
  return pet ? $.response.status(200).json(pet) : $.response.status(404).text("Not found");
};
```

The shown status codes and media types must be declared by the operation. An editor or explicit TypeScript check can flag structural mismatches in checked code. Run the [contract-change/typecheck recipe](./contract-change.md), then verify behavior with HTTP assertions; hot reload itself does not run a full project typecheck.

Repeat for each route the supported workflow needs. Give the agent the
workflow and state boundary explicitly; otherwise it may invent backend
behavior that the OpenAPI document does not specify. The clear file structure
and isolated scopes minimize interference between routes.

## What you get

- Typed contracts and narrow route files provide explicit constraints for an agent to work within.
- Explicit TypeScript checking catches many structural errors in typed code; HTTP tests still verify supported behavior.
- AI-generated implementations should be reviewed: type correctness does not guarantee behavioral correctness.
- The pattern works best when context types are already defined; ask the agent to implement the context before the route handlers.
- Keep that context deliberately small; generated code should model observable
  workflow states, not infer a production domain model.
- Unit-test the context class to keep shared logic reliable; handlers are intentionally thin and meant to be edited freely, so they do not need unit tests.

For a reproducible noninteractive task and review handoff, use [AI-assisted workflows](./agentic-sandbox.md).

## Keep exploring

- [Explore a New API](../getting-started.md) — the starting point; AI implementation upgrades random responses to working ones
- [Model the Workflow, Not the Backend](./model-the-workflow.md) — give the agent
  an explicit boundary for state and behavior
- [Test the Context, Not the Handlers](./test-context-not-handlers.md) — keep the context logic that the agent generates reliable and regression-proof
- [Mock APIs with Dummy Data](../manual/sample-responses.md) — the manual alternative when you need precise control over response content
- [Reference Implementation](model-the-workflow.md) — use reviewed AI-generated handlers as a reference for supported behavior
