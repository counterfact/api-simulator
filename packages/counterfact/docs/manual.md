# User manual

Build a useful local API, then add the behavior your client needs. Each chapter explains a feature, how to use it, and the boundaries to keep in mind.

New to Counterfact? Start with [Generate an API from OpenAPI](./getting-started.md), then follow the [first ten minutes](./first-10-minutes.md). For exact signatures and options, use the [API reference](./api.md).

Choose guides by task in [Find your workflow](./usage.md). Additional resources: [FAQ](./faq.md), [comparison](./comparison.md), [TypeScript native mode](./features/typescript-native-mode.md), and [telemetry and privacy](./usage.md#telemetry-and-privacy).

## Start a working API

- [Generate an API from OpenAPI](./getting-started.md) — Start a local HTTP API from a specification.
- [Guided coffee shop](./manual/guided-example.md) — Learn by editing a running API beside a working storefront.
- [Automatic sample responses](./manual/sample-responses.md) — Get schema-derived responses and select named examples.
- [Build without OpenAPI](./features/without-openapi.md) — Write routes before a specification exists.
- [Swagger UI](./manual/swagger-ui.md) — Browse operations and send requests in the browser.

## Define request and response behavior

- [Custom route handlers](./features/routes.md) — Read typed request data and implement HTTP operations.
- [Response building](./manual/responses.md) — Choose status codes, bodies, headers, cookies, and media types.
- [Streaming responses](./manual/streaming.md) — Return incremental events and records.
- [Failures, latency, and edge cases](./manual/edge-cases.md) — Exercise loading, error, retry, and empty states.
- [Request and response validation](./manual/validation.md) — Understand which contract mismatches are checked.
- [Middleware](./features/middleware.md) — Apply behavior across a route subtree.

## Model state and workflows

- [Stateful contexts](./features/state.md) — Let later requests observe earlier actions.
- [Nested and connected contexts](./manual/nested-contexts.md) — Divide state by route subtree and connect contexts.
- [Shared application store](./patterns/shared-store.md) — Share domain data across API groups.
- [Scenario scripts](./patterns/scenario-scripts.md) — Apply reusable state changes and startup setup.

## Explore a running simulation

- [Hot reload](./features/hot-reload.md) — Change behavior while preserving live state.
- [Interactive REPL](./features/repl.md) — Inspect and steer the running API from a terminal.
- [Request builder](./features/route-builder.md) — Construct, inspect, reuse, and send API requests.

## Work with evolving APIs

- [Proxying and hybrid simulation](./features/proxy.md) — Combine local handlers with upstream services.
- [Multiple APIs](./manual/multiple-apis.md) — Serve several specifications on one listener.
- [API versioning](./features/multiple-versions.md) — Serve versions side by side with version-aware types.
- [OpenAPI overlays](./manual/overlays.md) — Adapt a specification without editing its source.
- [Regeneration and generated code](./features/generated-code.md) — Refresh contracts while preserving editable routes.

## Integrate with development tools

- [Programmatic use and tests](./features/programmatic-api.md) — Start, inspect, reset, seed, and stop a simulator from code.
- [HTTP Admin API](./manual/admin-api.md) — Inspect contexts, routes, and proxy settings over HTTP.

## Complete workflows

- [Payment decline, retry, permissions, and reset](./patterns/payment-retry.md) — connect a small state model to real HTTP assertions.
- [Contract-change check](./patterns/contract-change.md) — regenerate types, observe a compiler error, and fix the handler.
- [Reproducible hybrid proxy](./patterns/hybrid-proxy.md#check-in-a-hybrid-setup) — check local/upstream selection into source control.
- [AI-assisted workflows](./patterns/agentic-sandbox.md) — run a bounded noninteractive task and return evidence for human review.
