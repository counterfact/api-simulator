# How Does Counterfact Compare?

There are several tools in the API mocking space. Here's an honest look at how Counterfact fits in.

## Quick comparison

| | Counterfact | [json-server](#counterfact-vs-json-server) | [WireMock](#counterfact-vs-wiremock) | [Prism](#counterfact-vs-prism) | [Microcks](#counterfact-vs-microcks) |
|---|---|---|---|---|---|
| **OpenAPI-native** | ✅ | ❌ | Partial | ✅ | ✅ |
| **Type-safe handlers** | ✅ TypeScript | ❌ | ❌ | ❌ | ❌ |
| **Real logic in handlers** | ✅ | Limited | Via templating | ❌ | Via scripts |
| **Hot reload** | ✅ state-preserving | ❌ | ❌ | ❌ | ❌ |
| **In-memory state** | ✅ shared Context | ✅ flat JSON | ❌ | ❌ | ❌ |
| **Interactive REPL** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Hybrid proxy** | ✅ per-path | ❌ | ✅ | ✅ | ✅ |
| **Request validation** | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Automated test use** | ✅ real HTTP server | ✅ | ✅ | ✅ | ✅ |
| **Language** | TypeScript | JavaScript | Java/JVM | Node.js | Java/JVM |
| **Self-hosted** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Zero config** | ✅ one command | ✅ | ❌ | ❌ | ❌ |

## What makes Counterfact unique

A few things that are genuinely hard to find elsewhere:

### 1. Type-safe handler files generated from your spec

You don't configure stubs. You write TypeScript. The types — derived directly from your OpenAPI document — tell you exactly what parameters you can read and what shapes your responses must be.

### 2. State-preserving hot reload

Edit a route file while the server is running. The handler updates instantly and your in-memory state survives. No restart, no re-seeding.

### 3. A REPL connected to your live server

Inspect state, fire requests, and trigger edge cases from an interactive terminal — without writing a script or touching a file.

### 4. Perfect for AI agents

If you're building an AI agent that calls third-party APIs, running against Counterfact eliminates rate limits, flaky network conditions, and costs during development. The local server responds immediately and you control every response.

### 5. Works in automated test pipelines

Counterfact starts fast enough to use in CI. Start it programmatically in a `beforeAll`, run real HTTP requests in your tests, and tear it down in `afterAll` — no separate test-double infrastructure required.

## Counterfact vs. json-server

**json-server** lets you stand up a REST API from a JSON file in seconds. It's great for simple CRUD with no spec.

Counterfact starts from an OpenAPI spec, not a flat JSON file, so you get correct types, valid schema-driven responses, and a server that matches your actual API contract — not just a generic REST interface you manually keep in sync.

Use json-server when: you need something quick and have no spec.
Use Counterfact when: you have an OpenAPI spec and want a server that actually matches it.

## Counterfact vs. WireMock

**WireMock** is battle-tested and runs on the JVM. It excels at stubbing precise request/response pairs and is widely used in Java/Spring ecosystems.

Counterfact is purpose-built for OpenAPI and TypeScript. Instead of configuring stubs, you write real TypeScript logic. Hot reload means you never restart. The REPL means you can inspect and mutate state live. If you're working in a Node.js or frontend-focused environment, Counterfact is a much lighter lift.

Use WireMock when: you're in a JVM ecosystem or need WireMock's extensive stub matching DSL.
Use Counterfact when: your team works in TypeScript and you want to write real handler logic, not stub configurations.

## Counterfact vs. Prism

**Prism** (by Stoplight) is an OpenAPI-aware proxy that validates requests and returns examples or random data. It's read-only — you can't persist state or write custom logic.

Counterfact generates editable TypeScript files. You can POST data and GET it back, enforce business rules, and simulate complex stateful scenarios. Prism validates; Counterfact simulates.

Use Prism when: you want passive validation and example-based responses with zero customization.
Use Counterfact when: you need state, custom logic, or behavior that changes based on what was previously sent.

## Counterfact vs. Microcks

**Microcks** is a full platform for API mocking and testing. It supports multiple protocols (REST, GraphQL, gRPC, event-driven), integrates with CI/CD pipelines, and offers a web UI for managing mocks across teams.

Counterfact is a developer tool, not a platform. It runs locally, starts in seconds, and is designed for the speed of day-to-day development — not for managing mocks shared across an organization.

Use Microcks when: you need centralized mock management across multiple teams and protocols.
Use Counterfact when: you're a developer who wants to spin up a mock in seconds on your laptop without standing up infrastructure.

## Counterfact vs. MSW (Mock Service Worker)

**MSW** intercepts requests in the browser or Node.js using Service Workers. It's excellent for unit and integration tests, and for mocking APIs in a test environment without a running server.

Counterfact runs an actual HTTP server. Other processes — not just the browser — can call it. It has persistent state, a REPL, and hot reload. It is designed for development workflows, but it works equally well in automated test suites — particularly end-to-end and integration tests where you need a real HTTP server that any client can reach, not just the one running in the same process.

**Using MSW and Counterfact together:** The two tools can complement each other. MSW can intercept browser fetch calls via its Service Worker and proxy them to a running Counterfact server. This lets you define all your route logic and state in Counterfact while MSW handles the browser-side interception — a natural fit for Playwright or Vitest browser-mode tests that need to call mock endpoints.

Use MSW when: you're writing frontend unit/integration tests and want to mock fetch calls in-process without a running server.
Use Counterfact when: you want a real HTTP server that any client (browser, mobile app, another service, or automated test runner) can call — including in CI pipelines and integration test suites.
Use both when: you need browser-level interception (MSW) plus stateful, logic-rich mock routes (Counterfact).

## Quickstart

```sh
npx counterfact@latest https://petstore3.swagger.io/api/v3/openapi.json api
```

> **Requires Node ≥ 22.0.0**

## See also

- [Getting started](./getting-started.md)
- [Patterns](./patterns/index.md)
- [Reference](./reference.md)
- [FAQ](./faq.md)
- [Usage](./usage.md)
