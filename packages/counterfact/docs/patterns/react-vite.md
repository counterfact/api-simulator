# Build a React and Vite screen before the backend is ready

Use Counterfact as a local HTTP API while React and Vite provide the frontend
development loop. The verified example keeps the OpenAPI document, authored
handler, frontend client, and integration assertions together.

## Run the example

Clone Counterfact, then run:

```sh
cd examples/react-vite
npm ci
npm run verify
```

The verification generates Counterfact's types and route scaffold, checks the
authored handler and React application with TypeScript, builds the Vite app,
and makes a real HTTP request to the local API.

## Follow the same pattern in your project

Start Counterfact from the OpenAPI document your frontend already targets:

```sh
npx counterfact@latest ./openapi.yaml api
```

Point the frontend client at `http://localhost:3100`:

```ts
export async function loadProfile(id: number) {
  const response = await fetch(`http://localhost:3100/profiles/${id}`);
  if (!response.ok)
    throw new Error(`Profile request failed: ${response.status}`);
  return response.json();
}
```

Counterfact's initial schema-derived response is enough to connect the screen.
When the UI needs a predictable person, edit the generated route handler:

```ts
export const GET: HTTP_GET = ($) =>
  $.response[200].json({
    id: $.path.profileId,
    name: "Ada Lovelace",
    role: "Frontend engineer",
  });
```

Saving the handler hot-reloads it. The frontend keeps using the same localhost
base URL, so the mock can become more specific without changing application
code.

## Contract boundary

This workflow proves that the frontend can communicate with behavior authored
against the OpenAPI contract. It does not prove production authorization,
side effects, performance, availability, or business rules. Retain focused
tests against the real service.

Continue with [state](../features/state.md) when the screen needs create/read
behavior or [Playwright error states](./playwright-error-states.md) when it
needs deterministic failure coverage.
