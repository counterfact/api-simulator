---
title: "docs: add Webhook Simulation usage pattern"
parentIssue: 1805
labels:
  - documentation
  - enhancement
assignees: []
milestone:
---

Add a usage pattern documenting how to simulate webhooks and push events from a Counterfact mock to a client application.

## Context

Many modern APIs are not purely request/response. They also push data to clients via webhooks (HTTP callbacks), Server-Sent Events (SSE), or WebSocket messages. Examples include Stripe's payment webhooks, GitHub's repository event hooks, and Slack's event subscriptions.

Counterfact currently has no built-in mechanism to initiate outbound HTTP calls or push events to a client. Developers building or testing webhook consumers have to either hit the real API or write a separate one-off script to send fake webhook payloads.

## Proposed feature

Add a way to trigger outbound HTTP calls from a Counterfact mock — for example, a `$.webhook(url, payload)` helper available in handlers or via the REPL. Combined with the existing REPL, this would allow developers to simulate the full webhook lifecycle interactively:

1. Client subscribes to a webhook by calling `POST /webhooks` on the mock
2. Developer triggers the event from the REPL: `client.post("/webhooks/trigger", { event: "payment.succeeded", ... })`
3. Counterfact sends an HTTP POST to the registered callback URL with the event payload

A `Webhook Simulation` pattern document would describe:

- When to use it: you are building a webhook consumer and need to test it locally without a real event source
- How to register a callback URL in the mock's context on subscription
- How to trigger an outbound call from the REPL or a handler
- Consequences and limitations: the callback URL must be reachable from the mock's process; production webhook signatures are not simulated unless explicitly added to the handler

## Acceptance criteria

- [ ] An outbound-call mechanism (e.g., `$.webhook()` or `$.emit()`) is implemented and documented
- [ ] `packages/counterfact/docs/patterns/webhook-simulation.md` is added following the established pattern format
- [ ] The new pattern is linked in `packages/counterfact/docs/patterns/index.md`
- [ ] The reference doc is updated to describe the new API
