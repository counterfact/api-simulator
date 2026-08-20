# Simulate Failures and Edge Cases

Exercise the error paths your client needs to handle—rate limits, server failures, validation rejections, and timeouts—whenever you need them.

## Why teams use this

Real APIs fail unpredictably. Reproducing a specific failure condition against a real service requires timing, coordination, or deliberate sabotage. In automated tests, non-deterministic failures are worse than no tests at all.

## How it works

Encode failure conditions directly in Counterfact route handlers. Use the `Context` to make failure modes togglable at runtime, so a test or a REPL command can turn an error on and off without restarting the server or editing files.

## Example

Define failure flags in the context:

```ts
// api/routes/_.context.ts
export class Context {
  isBroken = false;
  isRateLimited = false;
}
```

Read those flags in the route handler:

```ts
// api/routes/payments/{paymentId}.ts
export const GET: HTTP_GET = ($) => {
  if ($.context.isRateLimited) return $.response[429].text("Too Many Requests");
  if ($.context.isBroken) return $.response[500].text("Internal Server Error");
  return $.response[200].json({ id: $.path.paymentId, amount: 42.0 });
};
```

Toggle failures from the REPL or from a test without restarting the server:

```
⬣> context.isRateLimited = true
⬣> client.get("/payments/1")
{ status: 429, body: 'Too Many Requests' }

⬣> context.isRateLimited = false
⬣> context.isBroken = true
⬣> client.get("/payments/1")
{ status: 500, body: 'Internal Server Error' }
```

To simulate intermittent failures, use a counter or a random function:

```ts
export const GET: HTTP_GET = ($) => {
  $.context.callCount = ($.context.callCount ?? 0) + 1;
  if ($.context.callCount % 3 === 0) {
    return $.response[503].text("Flaky error");
  }
  return $.response[200].json({ id: $.path.petId });
};
```

Or vary the response probabilistically:

```ts
export const GET: HTTP_GET = ($) => {
  if (Math.random() < 0.2) {
    return $.response[503].text("Flaky error");
  }
  return $.response[200].json({ id: $.path.petId });
};
```

## What you get

- Flag-based failures are deterministic and reproducible — valuable for automated tests. Random and counter-based approaches introduce non-determinism intentionally, to simulate flakiness.
- The same handler serves both happy-path and failure traffic; a flag decides which.
- The context's in-memory state resets on server restart, so you always start from a clean slate.
- The pattern does not simulate network-level connection drops. For latency simulation, use `$.delay()` directly in the handler — see [Simulate Realistic Latency](./simulate-latency.md).

## Keep exploring

- [Mock APIs with Dummy Data](./mock-with-dummy-data.md) — the baseline happy-path handler this pattern extends
- [Simulate Realistic Latency](./simulate-latency.md) — add slow responses to complement error injection
- [Executable Spec](./executable-spec.md) — run these scenarios as automated contract tests
- [Agentic Sandbox](./agentic-sandbox.md) — test how an AI agent recovers from failures
