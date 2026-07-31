# Live Server Inspection with the REPL

Explore a running mock from the REPL: seed data, send real HTTP requests, inspect state, and toggle behavior without editing files or restarting.

## Why teams use this

Development workflows that require a restart to change behavior — seeding a database, flipping a feature flag, or exercising an edge case — break the feedback loop. Writing a dedicated script just to set up a specific scenario adds friction. Logging and printf-debugging only gives you output, not interactive control.

## How it works

Use Counterfact's built-in REPL. The REPL runs alongside the server in the same terminal, connected directly to the live `context` and a built-in `client`. You can call context methods to inspect or mutate state, send HTTP requests, read the responses, and toggle behavior flags — all without touching a file or restarting anything.

## Example

Start the server with the REPL enabled (the default when running via `npx counterfact@latest`). The prompt `⬣>` indicates the REPL is ready.

### Seed test data

```
⬣> context.add({ name: "Fluffy", status: "available", photoUrls: [] })
{ id: 1, name: 'Fluffy', status: 'available', photoUrls: [] }

⬣> context.add({ name: "Rex", status: "pending", photoUrls: [] })
{ id: 2, name: 'Rex', status: 'pending', photoUrls: [] }
```

### Send real requests and inspect responses

```
⬣> client.get("/pet/1")
{ status: 200, body: { id: 1, name: 'Fluffy', status: 'available', photoUrls: [] } }

⬣> client.post("/pet", { name: "Bella", status: "available", photoUrls: [] })
{ status: 200, body: { id: 3, name: 'Bella', status: 'available', photoUrls: [] } }
```

### Toggle failure modes without editing a file

If the context exposes a failure flag (see [Simulate Failures and Edge Cases](./simulate-failures.md)):

```
⬣> context.isRateLimited = true
⬣> client.get("/pet/1")
{ status: 429, body: 'Too Many Requests' }

⬣> context.isRateLimited = false
⬣> client.get("/pet/1")
{ status: 200, body: { id: 1, name: 'Fluffy', status: 'available', photoUrls: [] } }
```

### Inspect state mid-session

```
⬣> context.list()
[
  { id: 1, name: 'Fluffy', status: 'available', photoUrls: [] },
  { id: 2, name: 'Rex', status: 'pending', photoUrls: [] },
  { id: 3, name: 'Bella', status: 'available', photoUrls: [] }
]

⬣> context.list().filter(p => p.status === "available").length
2
```

### Control the proxy at runtime

```
⬣> .proxy on /payments    # forward /payments/* to the real API
⬣> client.get("/payments/42")
{ status: 200, body: { ... real response ... } }

⬣> .proxy off             # back to mock for everything
```

## What you get

- Changes made through the REPL take effect on the next request with no restart; the server is never interrupted.
- REPL state changes persist for the lifetime of the server process; restarting the server resets the context to its initial values.
- The `context` variable in the REPL is the same instance the route handlers use — there is no synchronization lag.
- The REPL is a JavaScript environment; any expression that is valid in a Node.js module is valid at the prompt, including `await`.

## Keep exploring

- [Simulate Failures and Edge Cases](./simulate-failures.md) — expose context flags that the REPL can toggle
- [Federated Context Files](./federated-context.md) — use `$.loadContext()` in the REPL to inspect a specific domain's context
- [Mock APIs with Dummy Data](./mock-with-dummy-data.md) — use the REPL to seed and inspect stateful handler data
- [Hybrid Proxy](./hybrid-proxy.md) — toggle individual proxy paths from the REPL during development
