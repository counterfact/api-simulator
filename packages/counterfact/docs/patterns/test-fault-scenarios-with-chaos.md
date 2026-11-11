# Test Fault Scenarios with Chaos Rules

Use the Live REPL to test how a client behaves under upstream failures without
changing route handlers or restarting Counterfact.

## Problem

Reproducing a 5xx response, a bounded outage, or intermittent failures often
requires temporary handler code. That mixes fault controls into the healthy
simulation and makes exploratory tests harder to repeat.

## Solution

Add an HTTP-response rule with `chaos()` while the simulator is running:

```ts
const intermittent = chaos("/payments")
  .probability(0.2)
  .status(503)
  .header("Retry-After", "1");

const outage = chaos("/payments").next(3).status(503);

intermittent.stop();
outage.stop();
```

Rules are active indefinitely by default. `next(...)` bounds a rule, and a
probability-skipped request does not consume its remaining count. In a
multi-API simulator, one REPL rule applies to matching routes across every API
group.

## Consequences

- Healthy route code stays unchanged.
- Rules can alter status, delay, headers, or body at the HTTP response layer.
- `Content-Type` stays under Counterfact's serialization control.
- This does not simulate network disconnects or transport-level timeouts.

## Related patterns

- [Simulate Failures and Edge Cases](./simulate-failures.md)
- [Simulate Realistic Latency](./simulate-latency.md)
- [Live Server Inspection with the REPL](./repl-inspection.md)
