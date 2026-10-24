# Find your workflow

Counterfact starts with an OpenAPI document, a local URL, and generated
responses. Choose the next guide by the job your frontend, team, or test suite
needs—not by a feature checklist.

For feature explanations, use the [user manual](./manual.md). For exact options and signatures, use the [API reference](./api.md).

## Frontend workflows

- [Guided coffee shop](./manual/guided-example.md) — learn by editing a running API beside a working shop; no OpenAPI document required.
- [Getting started](./getting-started.md) — run a local API and make a browser request.
- [Routes and custom responses](./features/routes.md) — shape the response a screen needs.
- [State](./features/state.md) — share small in-memory state across routes.
- [Hot reload](./features/hot-reload.md) — update handlers without restarting.
- [Generated code](./features/generated-code.md) — understand editable routes and generated types.
- [Failures, latency, and edge cases](./manual/edge-cases.md) — exercise error, empty, loading, and retry states.

## Team and test workflows

- [First 10 minutes](./first-10-minutes.md) — a small create/read workflow with one failure.
- [Automated integration tests](./patterns/automated-integration-tests.md) — start and stop a local API in tests.
- [Scenario scripts](./patterns/scenario-scripts.md) — create repeatable starting states.
- [Model the workflow](./patterns/model-the-workflow.md) — keep state small and document supported behavior.
- [Test context logic](./patterns/test-context-not-handlers.md) — verify domain behavior independently of HTTP adapters.
- [Payment retry and reset](./patterns/payment-retry.md) — run decline, recovery, permission, and isolation assertions.
- [Contract-change check](./patterns/contract-change.md) — regenerate, observe a type error, and repair a handler.
- [Shared store](./patterns/shared-store.md) — coordinate state across API groups.
- [Third-party SDK against a local API](./patterns/agentic-sandbox.md#point-a-third-party-sdk-at-a-local-api) — redirect the Stripe Node SDK, exercise a rate limit, and recover.
- [AI-assisted implementation](./patterns/ai-assisted-implementation.md) and [agentic sandbox](./patterns/agentic-sandbox.md) — give coding agents a bounded, verifiable API task.

## Advanced control

- [Proxy](./features/proxy.md) and [hybrid proxy](./patterns/hybrid-proxy.md) — combine local and upstream paths behind one base URL.
- [REPL](./features/repl.md) — inspect or steer a running local API.
- [Middleware](./features/middleware.md) — add cross-cutting behavior.
- [Programmatic API](./features/programmatic-api.md) — embed Counterfact in another process.
- [Multiple versions](./features/multiple-versions.md) — serve more than one API version.
- [TypeScript native mode](./features/typescript-native-mode.md) — understand native loading and installed-CLI limitations.

## Reference and troubleshooting

- [API reference](./api.md) — CLI flags, response builders, the `$` parameter, and architecture.
- [FAQ](./faq.md) — state, validation, type safety, and regeneration questions.
- [How Counterfact compares](./comparison.md) — comparison with json-server, WireMock, Prism, Microcks, and MSW.
- [Without OpenAPI](./features/without-openapi.md) — the alternative path when no OpenAPI document exists.

## Telemetry and privacy

Counterfact sends usage events to PostHog: startup options, hot-reload change
categories (route/context/OpenAPI), and REPL command names. Events include the
Node.js version, operating system, and architecture; startup events also include
the Counterfact version and a subset of resolved options such as port and enabled
actions. API file locations are SHA-256 hashed before sending. REPL command
arguments are not included in these events.

To disable Counterfact telemetry, set `COUNTERFACT_TELEMETRY_DISABLED=true`
before starting the process. For example, in a POSIX shell:

```sh
export COUNTERFACT_TELEMETRY_DISABLED=true
npx counterfact@latest ./openapi.yaml api
```

In PowerShell, use `$env:COUNTERFACT_TELEMETRY_DISABLED = "true"` before the
command. Telemetry is also disabled when the `CI` environment variable is set.
This switch controls Counterfact process telemetry; it does not configure
analytics on this website.

See [Feedback, Telemetry, and Privacy](https://github.com/counterfact/api-simulator/discussions/1527)
for the project discussion.
