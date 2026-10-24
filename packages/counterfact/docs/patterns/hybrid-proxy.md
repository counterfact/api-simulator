# Hybrid Proxy

Keep stable endpoints live while you build or replace the rest. Counterfact can serve local handlers for selected paths and forward everything else to the real backend.

## Why teams use this

You cannot route all traffic to the real backend — some paths don't exist yet, would cause side effects, or you want to test custom behavior there. But you also cannot mock everything when the real backend exists and you want real data on the stable paths.

## How it works

Start Counterfact with `--proxy-url` pointing at the real backend. Every request is forwarded to the real backend by default. For each path you want to control locally, add a route handler **and turn proxying off for that path**. Toggle paths between local and upstream behavior from the REPL without restarting the server.

## Example

```sh
npx counterfact@latest openapi.yaml api --proxy-url https://api.example.com
```

Add a route handler for any path you want to mock:

```ts
// api/routes/payments.ts
export const POST: HTTP_POST = function ($) {
  return $.response.status(200).json({ transactionId: "mock-txn-001" });
};
```

Turn proxying off for that path so the local handler receives it:

```
⬣> .proxy off /payments
```

Requests to `/payments` are now served by your handler; all other requests remain forwarded to `https://api.example.com`.

Toggle individual paths at runtime from the REPL without touching any files:

```
⬣> .proxy on /payments    # forward /payments/* to the real API
⬣> .proxy off /payments   # mock /payments/* again
⬣> .proxy off             # disable the root proxy default
```

`.proxy off` changes the root default, not existing path-specific overrides. Disable each explicit `on` override separately if every request must stay local. REPL toggles are session controls; use the checked-in setup below to reproduce routing across starts.

## Check in a hybrid setup

Install and pin Counterfact as a development dependency and commit its lockfile. Keep the specification and route files with the client. For example, generate routes for `/users` and `/payments`, then make `/users` forward while `/payments` remains local:

```ts
// api/routes/users.ts
import type { HTTP_GET } from "../types/paths/users.types.js";
export const GET: HTTP_GET = function ($) {
  return $.proxy("http://127.0.0.1:9000/users");
};
```

```ts
// api/routes/payments.ts
import type { HTTP_POST } from "../types/paths/payments.types.js";
export const POST: HTTP_POST = function ($) {
  return $.response.status(200).json({ transactionId: "mock-txn-001" });
};
```

This example assumes the specification declares the shown operations and the payment's 200 JSON response. Choose your upstream URL, including the operation path, in the authored forwarding handler. The helper does not automatically append an incoming path or query string; construct those explicitly if the operation needs them. Start with **no global proxy default**:

```sh
npx counterfact ./openapi.yaml api
```

Every teammate starts with the same routing: GET `/users` goes upstream; POST `/payments` runs locally. The client keeps `http://localhost:3100` as its base URL. Forwarding requires the upstream to be reachable and retains incoming credentials; use development credentials suitable for that service.

For runtime-only path selection from code, `counterfact()` also accepts `proxyUrl` and a `proxyPaths` map. The route-level approach above keeps the selection visible in ordinary source files.

## As endpoints become ready

Replace one local handler with `$.proxy(explicitUpstreamUrl)`, verify that operation against the real service, and repeat as endpoints arrive. When the client no longer needs simulation, change its configured base URL to the backend and remove the Counterfact startup step. Keep scenarios and local tests if they remain useful for controlled edge cases.

## What you get

- The real backend must be reachable from your machine; the proxy adds a network hop.
- Handler hot reload works on mocked paths; toggling proxy mode does not require a restart.
- Forwarded requests carry the original headers and body; you do not have control over the real backend's response.
- Configuration-selected forwarding (`--proxy-url` and path toggles) bypasses local route handlers and Counterfact's request/response checks. Route-level `$.proxy()` runs inside a local handler and passes through local checks; see the [proxy reference](../api/handlers.md). Use targeted tests against both local and upstream paths when drift matters.

## Keep exploring

- [Explore a New API](../getting-started.md) — start fully mocked; add a proxy URL as the real backend comes online
- [Simulate Failures and Edge Cases](../manual/edge-cases.md) — use mocked paths to inject errors that the real backend won't produce on demand
- [Reference Implementation](model-the-workflow.md) — replace proxied paths one at a time with handlers for supported behavior
