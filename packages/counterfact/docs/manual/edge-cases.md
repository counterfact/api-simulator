# Failures, latency, and edge cases

Use controlled responses to see what the client does when an API is slow, returns no results, rejects a request, or fails temporarily.

## Return a specific case

Change the relevant handler to return a deterministic body. For a collection operation, an empty collection can exercise an empty screen:

```ts
export const GET: HTTP_GET = function ($) {
  return $.response.status(200).json([]);
};
```

Choose a body that matches your operation's schema. For an error, choose a status and body declared by your specification. If the test intentionally violates the contract, use `$.x.response` and check the validation settings explicitly.

## Add a delay

```ts
export const GET: HTTP_GET = async function ($) {
  await $.delay(1500);
  return $.response.status(200).random();
};
```

The delay is in milliseconds. Supply two numbers for a random duration within that range. Use a fixed delay when comparing client behavior across runs.

## Switch failures at runtime

Define failure flags in the context:

```ts
// api/routes/_.context.ts
export class Context {
  isBroken = false;
  isRateLimited = false;
  callCount = 0;
}
```

Read those flags in the route handler. The OpenAPI operation must declare the shown status codes and media types (including `503` for the later examples), so its generated response builders allow them:

```ts
// api/routes/payments/{paymentId}.ts
import type { HTTP_GET } from "../../types/paths/payments/{paymentId}.types.js";

export const GET: HTTP_GET = function ($) {
  if ($.context.isRateLimited) return $.response.status(429).text("Too Many Requests");
  if ($.context.isBroken) return $.response.status(500).text("Internal Server Error");
  return $.response.status(200).json({ id: $.path.paymentId, amount: 42.0 });
};
```

Toggle failures from the REPL or from a test without restarting the server. This abbreviated `client` output omits request logs, headers, and colors; the client returns a promise of raw HTTP text, not a `{ status, body }` object:

```
⬣> context.isRateLimited = true
⬣> void client.get("/payments/1")
HTTP/1.1 429 Too Many Requests

Too Many Requests

⬣> context.isRateLimited = false
⬣> context.isBroken = true
⬣> void client.get("/payments/1")
HTTP/1.1 500 Internal Server Error

Internal Server Error
```

To simulate intermittent failures, use a counter or a random function:

```ts
export const GET: HTTP_GET = function ($) {
  $.context.callCount += 1;
  if ($.context.callCount % 3 === 0) {
    return $.response.status(503).text("Flaky error");
  }
  return $.response.status(200).json({ id: $.path.paymentId });
};
```

Or vary the response probabilistically:

```ts
export const GET: HTTP_GET = function ($) {
  if (Math.random() < 0.2) {
    return $.response.status(503).text("Flaky error");
  }
  return $.response.status(200).json({ id: $.path.paymentId });
};
```

Flag-based failures are repeatable when setup is controlled. Reset counters before comparing runs; random failures are intentionally nondeterministic. Use the complete [payment retry recipe](../patterns/payment-retry.md) for a contract, handlers, scenarios, and executable assertions.

## Configure latency at runtime

```ts
// api/routes/_.context.ts
export class Context {
  latencyMs = 0;
}
```

```ts
// api/routes/pet/{petId}.ts
export const GET: HTTP_GET = async function ($) {
  await $.delay($.context.latencyMs);
  const pet = $.context.get($.path.petId);
  return pet ? $.response.status(200).json(pet) : $.response.status(404).text("Not found");
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

Delays run inside the handler; they do not model connection setup, packet loss, or network jitter. Use fixed values for repeatable checks and restore zero delay for fast development. Controlled state and delays do not make generated random data deterministic.

Hot reload preserves live state. Resetting state in tests is an explicit [programmatic operation](../api/simulator.md). See [validation](./validation.md) for contract boundaries.
