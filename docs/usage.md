# Usage

Counterfact is three tools in one:

- a **code generator** that converts an [OpenAPI](https://support.smartbear.com/swaggerhub/docs/tutorials/openapi-3-tutorial.html) document to [TypeScript](https://www.typescriptlang.org/) route files
- a **mock server** optimized for front-end development workflows
- a **live REPL** for inspecting and manipulating server state at runtime

This page is your map to the documentation.

---

## Getting started

New to Counterfact? Begin with the [Getting Started guide](./getting-started.md) for a step-by-step walkthrough.

---

## Features

| Feature | Description |
|---|---|
| [Generated code](./features/generated-code.md) | How Counterfact generates TypeScript from your OpenAPI spec |
| [Routes](./features/routes.md) | Writing route handlers, building responses, reading request data |
| [State (context objects)](./features/state.md) | Sharing in-memory state across routes |
| [Hot reload](./features/hot-reload.md) | Live file updates without restarting the server |
| [REPL](./features/repl.md) | Interactive terminal for runtime inspection and control |
| [Proxy](./features/proxy.md) | Mix real backend calls with mocked endpoints |
| [Middleware](./features/middleware.md) | Cross-cutting request/response logic |
| [TypeScript native mode](./features/typescript-native-mode.md) | Run route files directly without a compilation step |
| [Programmatic API](./features/programmatic-api.md) | Embed Counterfact in test suites with Playwright, Cypress, etc. |
| [Without OpenAPI](./features/without-openapi.md) | Use Counterfact without an OpenAPI document |
| [Multiple versions](./features/multiple-versions.md) | Serve multiple API versions simultaneously from a single process |

---

## Patterns

Patterns are reusable solutions to recurring problems when building API simulations.

See the [patterns index](./patterns/index.md) for the full list.

---

## Reference

Complete technical reference: the `$` parameter API, CLI flags, architecture overview, and more.

→ [Reference](./reference.md)

---

## FAQ

Common questions about state, types, hot reload, code generation, and regeneration.

→ [FAQ](./faq.md)

---

## Telemetry and privacy

Counterfact records startup options, hot-reload change categories (route/context/OpenAPI), and REPL command names. API file locations are hashed and command arguments are never sent.

→ [Telemetry discussion](https://counterfact.dev/telemetry-discussion)

---

## How it compares

Side-by-side comparison with json-server, WireMock, Prism, Microcks, and MSW.

→ [How it compares](./comparison.md)
