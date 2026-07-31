# Simulate Realistic Latency

See how a UI or client feels under realistic response times, not just the near-instant responses a local mock produces by default.

## Why teams use this

A local mock responds in microseconds. UIs built against it may never surface loading states, skeleton screens, timeout handling, or spinner behavior. Teams have demoed polished UIs built against Counterfact only to discover, when the real backend connected, that the experience degrades badly under normal network latency. Unrealistic speed is a feature during development but a liability during UX validation.

## How it works

Use `$.delay(ms)` in route handlers to introduce controlled response delays. Apply it selectively — to the routes under active UX development — without affecting the rest of the mock. Adjust the delay from the REPL at runtime or via a context flag so you can toggle between fast and slow responses without restarting the server.

## Example

Add a delay to a single handler:

```ts
// api/routes/pet/{petId}.ts
export const GET: HTTP_GET = async ($) => {
  await $.delay(300); // simulate 300ms backend latency
  const pet = $.context.get($.path.petId);
  return pet ? $.response[200].json(pet) : $.response[404].text("Not found");
};
```

To make the delay configurable at runtime, read it from context:

```ts
// api/routes/_.context.ts
export class Context {
  latencyMs = 0;
}
```

```ts
// api/routes/pet/{petId}.ts
export const GET: HTTP_GET = async ($) => {
  await $.delay($.context.latencyMs);
  const pet = $.context.get($.path.petId);
  return pet ? $.response[200].json(pet) : $.response[404].text("Not found");
};
```

Toggle latency from the REPL while the UI is running:

```
⬣> context.latencyMs = 2000
```

Every subsequent request now takes two seconds. Observe the UI's loading state, then restore fast responses:

```
⬣> context.latencyMs = 0
```

To simulate variable latency, use a random delay within a range:

```ts
await $.delay(Math.random() * 500 + 100); // 100–600ms
```

## What you get

- Latency is applied at the handler level, so different routes can have different delays — realistic, since not all operations take the same time.
- The delay is entirely in-process; it does not simulate network jitter, packet loss, or connection setup time.
- Setting latency via context means it can be changed at runtime from the REPL without editing files or restarting the server.
- During active development, set `latencyMs = 0` to keep feedback loops tight; increase it for UX validation sessions.

## Keep exploring

- [Simulate Failures and Edge Cases](./simulate-failures.md) — pair latency with error injection for comprehensive resilience testing
- [Agentic Sandbox](./agentic-sandbox.md) — add latency to evaluate how an AI agent handles slow upstream responses
- [Mock APIs with Dummy Data](./mock-with-dummy-data.md) — the baseline handler that latency simulation extends
