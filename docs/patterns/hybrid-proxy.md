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
export const POST: HTTP_POST = ($) => {
  return $.response[200].json({ transactionId: "mock-txn-001" });
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
⬣> .proxy off             # mock everything
```

## What you get

- The real backend must be reachable from your machine; the proxy adds a network hop.
- Handler hot reload works on mocked paths; toggling proxy mode does not require a restart.
- Forwarded requests carry the original headers and body; you do not have control over the real backend's response.
- Forwarded traffic bypasses local route handlers and Counterfact's request/response checks. Use targeted tests against both local and upstream paths when drift matters.

## Keep exploring

- [Explore a New API](./explore-new-api.md) — start fully mocked; add a proxy URL as the real backend comes online
- [Simulate Failures and Edge Cases](./simulate-failures.md) — use mocked paths to inject errors that the real backend won't produce on demand
- [Reference Implementation](./reference-implementation.md) — replace proxied paths one at a time with fully implemented mock handlers
