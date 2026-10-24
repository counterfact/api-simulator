# AI-Assisted Implementation

Ask a coding agent to replace generated responses with the behavior your app needs. Start by defining the context methods the handlers will call. The example below uses the pet `get(id)` method from the [state guide](../features/state.md).

<span id="why-teams-use-this"></span>
<span id="how-it-works"></span>
<span id="example"></span>

## Implement one route

Generated types help a coding agent use the right inputs and response shapes. Ask it to replace `.random()` calls with the behavior you need, one route at a time. Review the code and test it over HTTP.

After generating the project, point an AI agent at a handler file and ask it to implement the route:

```
Given the TypeScript types in api/types/, implement the GET handler in api/routes/pet/{petId}.ts
to look up a pet from context by path parameter and return 200 with the pet or 404 if not found.
```

The agent sees the fully typed `$` parameter, the spec-derived response types, and the context definition in `api/routes/_.context.ts`. It produces something like:

```ts
// api/routes/pet/{petId}.ts
export const GET: HTTP_GET = function ($) {
  const pet = $.context.get($.path.petId);
  return pet
    ? $.response.status(200).json(pet)
    : $.response.status(404).text("Not found");
};
```

Declare the shown status codes and media types in the spec. Run the
[TypeScript check](./contract-change.md) to catch mismatched types, then send
HTTP requests to test the behavior. Hot reload does not run a full typecheck.

Repeat for each route your app needs. Tell the agent which behavior to
implement and which state to keep; the spec alone does not describe all of
the backend’s business rules.

<span id="what-you-get"></span>

## Review and test the result

- Typed contracts and narrow route files provide explicit constraints for an agent to work within.
- Explicit TypeScript checking catches many structural errors in typed code; HTTP tests still verify supported behavior.
- AI-generated implementations should be reviewed: type correctness does not guarantee behavioral correctness.
- The pattern works best when context types are already defined; ask the agent to implement the context before the route handlers.
- Keep that context deliberately small; generated code should model observable
  workflow states, not infer a production domain model.
- Unit-test the context class to keep shared logic reliable; handlers are intentionally thin and meant to be edited freely, so they do not need unit tests.

For a reproducible noninteractive task and review handoff, use [AI-assisted workflows](./agentic-sandbox.md).

<span id="keep-exploring"></span>

## Related guides

- [Explore a New API](../getting-started.md) — the starting point; AI implementation upgrades random responses to working ones
- [Model the Workflow, Not the Backend](./model-the-workflow.md) — give the agent
  an explicit boundary for state and behavior
- [Test the Context, Not the Handlers](./test-context-not-handlers.md) — keep the context logic that the agent generates covered by tests
- [Mock APIs with Dummy Data](../manual/sample-responses.md) — the manual alternative when you need precise control over response content
- [Reference Implementation](model-the-workflow.md) — use reviewed AI-generated handlers as a reference for supported behavior
