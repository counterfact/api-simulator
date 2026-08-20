# Reference Implementation

Turn an OpenAPI spec into a working example of the behavior consumers can rely on—before the production service exists or alongside it.

## Why teams use this

An OpenAPI spec describes the structure of an API but not its behavior. Teams building the production service, writing tests, or consuming the API have to interpret spec prose to understand what should happen in each situation. Misinterpretations accumulate silently until something breaks in production.

## How it works

Implement the routes and observable behavior consumers need. Prefer
deterministic responses, then add the smallest state model required by
cross-request workflows. TypeScript types derived from the spec constrain the
responses to the contract. The result is an executable, testable artifact that
expresses supported behavior in code, not prose — and stays synchronized with
the spec automatically.

A reference implementation is not a production twin. It should document
decisions at the API boundary without copying the backend's persistence model,
internal services, asynchronous machinery, or every business rule.

## Example

Write the OpenAPI spec, then generate and implement the handlers:

```sh
npx counterfact@latest openapi.yaml api
```

Implement each handler with the intended behavior:

```ts
// api/routes/pet.ts
export const POST: HTTP_POST = ($) => {
  if (!$.body.name) return $.response[400].text("name is required");
  const pet = $.context.add($.body);
  return $.response[200].json(pet);
};
```

TypeScript highlights contract violations in the IDE and in CI:

```ts
// Your IDE warns here if the response shape no longer matches the spec.
return $.response[200].json(pet);
```

When the spec changes, regenerate the types:

```sh
npx counterfact@latest openapi.yaml api --generate-types
```

TypeScript immediately surfaces every handler that no longer matches the updated contract. Fix those handlers, and the reference implementation is up to date.

## What you get

- The implementation is a living document: it compiles against the spec and TypeScript surfaces divergence in the IDE and in CI.
- Teams building the production service can read the handlers to understand supported behavior, including selected validation rules and edge cases, without interpreting prose.
- The implementation is not a substitute for the production service — it runs in-memory, has no persistence, and is not hardened for production traffic.
- Type errors do not stop the server from running — temporary mismatches are tolerated during active development. CI should enforce that there are no compile errors before merging.

## Keep exploring

- [Model the Workflow, Not the Backend](./model-the-workflow.md) — keep the
  reference useful without turning it into a second backend
- [Mock APIs with Dummy Data](./mock-with-dummy-data.md) — the starting point; a reference implementation adds meaningful logic on top
- [Executable Spec](./executable-spec.md) — use the reference implementation as the basis for contract tests
- [Hybrid Proxy](./hybrid-proxy.md) — replace the reference implementation path-by-path as the production service comes online
