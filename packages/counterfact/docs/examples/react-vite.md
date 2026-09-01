# Build a React and Vite screen before the backend is ready

Use Counterfact as a local HTTP API while React and Vite provide the frontend
development loop. The complete application, OpenAPI document, authored
handler, frontend client, and tests are repository-hosted at
[`examples/react-vite`](https://github.com/counterfact/api-simulator/tree/main/examples/react-vite).
It is not included in the `counterfact` npm package.

## Run the example in a browser

Clone Counterfact and enter the repository-hosted example:

```sh
git clone https://github.com/counterfact/api-simulator.git
cd api-simulator/examples/react-vite
npm ci
```

In one terminal, start Counterfact:

```sh
npm run api
```

In a second terminal, start Vite:

```sh
npm run dev
```

Open [http://127.0.0.1:4309](http://127.0.0.1:4309). The screen displays the
Ada Lovelace profile served by Counterfact at `http://127.0.0.1:4310`. Stop
each process with <kbd>Ctrl</kbd>+<kbd>C</kbd> when you are finished.

## Verify it automatically

```sh
npm run verify
```

This command generates Counterfact's types and route scaffold, type-checks the
authored handler and React application, builds the Vite app, and makes a real
HTTP request to the local API. It is an automated build/type/API check, not
proof that a browser client has opened successfully.

## Follow the same pattern in your project

Start Counterfact from the OpenAPI document your frontend already targets:

```sh
npx counterfact@latest ./openapi.yaml api --port 4310
```

Point the frontend client at `http://127.0.0.1:4310`:

```ts
export async function loadProfile(id: number) {
  const response = await fetch(`http://127.0.0.1:4310/profiles/${id}`);
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

Saving the handler hot-reloads it. The frontend keeps using the same local API
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
