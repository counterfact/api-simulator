# Usage

Counterfact starts with an OpenAPI document, a local URL, and generated
responses. Choose the next guide by the job your frontend, team, or test suite
needs—not by a feature checklist.

## Frontend workflows

- [Getting started](./getting-started.md) — run a local API and make a browser request.
- [Routes and custom responses](./features/routes.md) — shape the response a screen needs.
- [State](./features/state.md) — share small in-memory state across routes.
- [Hot reload](./features/hot-reload.md) — update handlers without restarting.
- [Generated code](./features/generated-code.md) — understand editable routes and generated types.
- [React and Vite](./patterns/react-vite.md) — build a screen against a local contract-shaped API.
- [Simulate failures](./patterns/simulate-failures.md) and [simulate latency](./patterns/simulate-latency.md) — exercise error, empty, loading, and retry states.

## Team and test workflows

- [First 10 minutes](./first-10-minutes.md) — a small create/read workflow with one failure.
- [Automated integration tests](./patterns/automated-integration-tests.md) — start and stop a local API in tests.
- [Playwright error states](./patterns/playwright-error-states.md) — verify success, not-found, and temporary-failure UI states.
- [Scenario scripts](./patterns/scenario-scripts.md) — create repeatable starting states.
- [Shared store](./patterns/shared-store.md) — coordinate state across API groups.
- [AI-assisted implementation](./patterns/ai-assisted-implementation.md) and [agentic sandbox](./patterns/agentic-sandbox.md) — give coding agents a bounded, verifiable API task.

## Advanced control

- [Proxy](./features/proxy.md) and [hybrid proxy](./patterns/hybrid-proxy.md) — combine local and upstream paths behind one base URL.
- [REPL](./features/repl.md) — inspect or steer a running local API.
- [Middleware](./features/middleware.md) — add cross-cutting behavior.
- [Programmatic API](./features/programmatic-api.md) — embed Counterfact in another process.
- [Multiple versions](./features/multiple-versions.md) — serve more than one API version.
- [TypeScript native mode](./features/typescript-native-mode.md) — run route files directly.

## Reference and troubleshooting

- [Reference](./reference.md) — CLI flags, response builders, the `$` parameter, and architecture.
- [FAQ](./faq.md) — state, validation, type safety, and regeneration questions.
- [How Counterfact compares](./comparison.md) — comparison with json-server, WireMock, Prism, Microcks, and MSW.
- [Without OpenAPI](./features/without-openapi.md) — the alternative path when no OpenAPI document exists.

## Telemetry and privacy

Counterfact records start attempts and outcomes, the first API request served,
startup options, hot-reload change categories (route/context/OpenAPI), and REPL
command names. A random installation identifier links these anonymous events
for retention analysis and rotates after 180 days. Each run receives a separate
session identifier.

API file locations are hashed. Counterfact never sends raw paths, OpenAPI
documents or URLs, request paths or data, headers, tokens, error messages,
project names, or command arguments. Telemetry is disabled in CI and when
`COUNTERFACT_TELEMETRY_DISABLED=true`. See the
[telemetry discussion](https://counterfact.dev/telemetry-discussion).
