# Test Fault Scenarios with Chaos Rules

You want to test how a client, UI, or integration behaves under upstream failures without editing route handlers or restarting the mock server.

## Problem

Failure behavior is often tested too late because reproducing 5xxs, flaky responses, or temporary outages usually means changing handler code, wiring custom flags, or waiting for real backend incidents.

## Solution

Use Counterfact's `chaos()` API from the Live REPL to inject HTTP-layer faults on demand. Keep the baseline handlers unchanged, then apply temporary rules for the exact paths and failure profiles you want to exercise.

## Example

Start with a healthy service:

```text
⬣> client.get("/payments/42")
{ status: 200, body: { ... } }
```

Inject an intermittent upstream failure pattern:

```ts
// Match /payments* requests indefinitely,
// but fail only about 20% with a retry hint.
chaos("/payments")
  .always()
  .probability(0.2)
  .status(503)
  .header("Retry-After", "1");
```

You can also target a bounded outage:

```ts
// Fail the next 3 matching requests, then stop automatically.
chaos("/payments").next(3).status(503);
```

And remove the rule when your test scenario is complete:

```ts
const fault = chaos("/payments").always().status(500);
fault.stop();
```

## Consequences

- Faults are injected at the HTTP response layer, so you can test resilience behavior without changing route files.
- Rules are fast to toggle from the REPL, which is useful for exploratory testing and manual acceptance checks.
- `probability(...)` enables controlled flakiness; `next(count)` enables deterministic burst failures.
- This pattern does not simulate low-level network disconnects; it focuses on HTTP response behavior.

## Related Patterns

- [Simulate Failures and Edge Cases](./simulate-failures.md) — implement failure behavior directly in handlers/context
- [Simulate Realistic Latency](./simulate-latency.md) — add delayed responses to complement fault injection
- [Live Server Inspection with the REPL](./repl-inspection.md) — drive chaos rules and requests interactively
