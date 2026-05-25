# Usage Patterns

A pattern is a reusable solution to a recurring problem when building API simulations with Counterfact. Each pattern below describes a context, the problem it addresses, the solution, and its consequences.

Most projects start with [Explore a New API](./explore-new-api.md) or [Executable Spec](./executable-spec.md) to get a running server from an OpenAPI spec with no code. From there, [Mock APIs with Dummy Data](./mock-with-dummy-data.md) and [AI-Assisted Implementation](./ai-assisted-implementation.md) are the natural next steps for adding realistic responses — the former by hand, the latter with an AI agent doing the heavy lifting.

As the mock grows, [Scenario Scripts](./scenario-scripts.md) let you automate repetitive REPL interactions — seeding data on startup, building reusable request sequences — while [Federated Context Files](./federated-context.md) and [Test the Context, Not the Handlers](./test-context-not-handlers.md) keep the stateful logic organized and reliable. [Live Server Inspection with the REPL](./repl-inspection.md) is Counterfact's most distinctive feature, letting you seed data, send requests, and toggle behavior in real time without restarting, and [Simulate Failures and Edge Cases](./simulate-failures.md), [Test Fault Scenarios with Chaos Rules](./test-fault-scenarios-with-chaos.md), and [Simulate Realistic Latency](./simulate-latency.md) extend any mock to cover the error paths and performance characteristics that real services exhibit.

When your project involves multiple versions or multiple specs, [Multiple API Versions](./multiple-versions.md) shows how to serve them from a shared set of route files using `$.minVersion()` to branch on version without duplicating handlers. For teams that want the mock to remain a reliable, long-lived artifact, [Reference Implementation](./reference-implementation.md) and [Automated Integration Tests](./automated-integration-tests.md) make it a first-class part of the codebase that can run in CI. Finally, [Agentic Sandbox](./agentic-sandbox.md) and [Hybrid Proxy](./hybrid-proxy.md) address the two common integration strategies — isolating an AI agent from the real service, or blending mock and live traffic — and [Custom Middleware](./custom-middleware.md) covers cross-cutting concerns like authentication and logging without touching individual handlers.

## All patterns

| Pattern | When to use it |
|---|---|
| [Explore a New API](./explore-new-api.md) | You have a spec but no running backend or production access |
| [Executable Spec](./executable-spec.md) | You want immediate feedback on how spec changes affect the running server during API design |
| [Mock APIs with Dummy Data](./mock-with-dummy-data.md) | You need realistic-looking responses to build a UI, run a demo, or write assertions |
| [Scenario Scripts](./scenario-scripts.md) | You want to automate REPL interactions, seed data on startup, or build reusable state configurations |
| [AI-Assisted Implementation](./ai-assisted-implementation.md) | You want an AI agent to replace random responses with working handler logic |
| [Federated Context Files](./federated-context.md) | You want each domain to own its state, with explicit cross-domain dependencies |
| [Test the Context, Not the Handlers](./test-context-not-handlers.md) | You want to keep shared stateful logic reliable as the mock grows |
| [Live Server Inspection with the REPL](./repl-inspection.md) | You want to seed data, send requests, and toggle behavior without restarting the server |
| [Simulate Failures and Edge Cases](./simulate-failures.md) | You need reproducible, on-demand error conditions for development or testing |
| [Test Fault Scenarios with Chaos Rules](./test-fault-scenarios-with-chaos.md) | You want to inject HTTP-layer failures on demand using `chaos()` without editing handlers |
| [Simulate Realistic Latency](./simulate-latency.md) | You want to test how clients and UIs behave under realistic response times |
| [Reference Implementation](./reference-implementation.md) | You want a working, executable implementation that expresses intended API behavior in code |
| [Multiple API Versions](./multiple-versions.md) | You maintain multiple versions of an API and want shared handlers that adapt by version |
| [Agentic Sandbox](./agentic-sandbox.md) | You are building an AI coding agent and want to avoid rate limits and costs during development |
| [Hybrid Proxy](./hybrid-proxy.md) | Some endpoints exist in the real backend; others need to be mocked |
| [Automated Integration Tests](./automated-integration-tests.md) | You want to run real HTTP tests against the mock in a CI-friendly test suite |
| [Custom Middleware](./custom-middleware.md) | You want authentication, headers, or logging applied uniformly across a group of routes |

## See also

- [Getting started](../getting-started.md)
- [Reference](../reference.md)
- [FAQ](../faq.md)
- [How it compares](../comparison.md)
- [Usage](../usage.md)
