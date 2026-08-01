# Agentic Sandbox

Give an AI coding agent a local version of the third-party API it needs. Your iterations stay fast and cheap, and you can exercise the same response—including failures—as many times as you like.

## Why teams use this

Third-party API calls from an agent cost money, consume quota, and can fail for reasons unrelated to the agent's logic. Reproducibility is essential for iterating on agent behavior, but real services are not reproducible.

## How it works

Point the agent at a Counterfact mock instead of the real service. Control exactly what the mock returns so you can test every response scenario — including failures — cheaply and repeatably. Use the REPL to change mock behavior while the agent is running, without restarting anything.

## Example

Generate the mock from the target API's OpenAPI spec:

```sh
npx counterfact@latest https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.yaml stripe-mock
```

Configure the agent to point at the mock instead of the real Stripe API:

```ts
const stripe = new Stripe("sk_test_fake", {
  host: "localhost",
  port: 3100,
  protocol: "http",
});
```

Customize the handler to return exactly what your agent needs to see:

```ts
// stripe-mock/routes/v1/charges.ts
export const POST: HTTP_POST = ($) => {
  return $.response[200].json({
    id: "ch_mock_001",
    status: "succeeded",
    amount: $.body.amount,
    currency: $.body.currency,
  });
};
```

To test how the agent handles a rate limit, toggle a context flag and steer the agent from the REPL while it runs:

```ts
// stripe-mock/routes/_.context.ts
export class Context {
  simulateRateLimit = false;
}
```

```ts
// stripe-mock/routes/v1/charges.ts
export const POST: HTTP_POST = ($) => {
  if ($.context.simulateRateLimit) {
    return $.response[429].json({ error: { message: "Too many requests" } });
  }
  return $.response[200].json({
    id: "ch_mock_001",
    status: "succeeded",
    amount: $.body.amount,
    currency: $.body.currency,
  });
};
```

```
⬣> context.simulateRateLimit = true
```

The agent's next request hits the 429. Its retry logic runs for real.

## What you get

- Every request is local, instantaneous, and free — iteration speed is limited only by the agent's logic.
- Response content is fully controlled, so agent behavior is reproducible across runs.
- The mock does not replicate the real API's stateful semantics unless you implement them explicitly.
- The mock is only as accurate as the OpenAPI spec it was generated from.

## Keep exploring

- [Simulate Failures and Edge Cases](./simulate-failures.md) — the general technique for toggling error conditions at runtime
- [Mock APIs with Dummy Data](./mock-with-dummy-data.md) — serve realistic responses for the happy path
- [AI-Assisted Implementation](./ai-assisted-implementation.md) — use an AI agent to implement stateful handler logic so the mock more faithfully replicates the real API's semantics
- [Hybrid Proxy](./hybrid-proxy.md) — selectively forward some agent calls to the real API while mocking others
