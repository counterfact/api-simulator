# Public packages

Use declared package entry points. Each package's README contains public-import examples and its `package.json` declares the supported exports.

| Package / entry point                        | Scope                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `counterfact`                                | `counterfact()` and simulator configuration/lifecycle types; the CLI combines generation, runtime, and REPL. |
| `@counterfact/client`                        | Raw HTTP client, route catalog, and immutable request builder.                                               |
| `@counterfact/openapi`                       | OpenAPI loading, bundling, dereferencing, and overlays.                                                      |
| `@counterfact/generator`                     | TypeScript contracts, editable route scaffolding, scenarios, and templates.                                  |
| `@counterfact/runtime`                       | Registries, dispatch contracts, validation, and module loading.                                              |
| `@counterfact/runtime/koa`                   | Koa HTTP adapter.                                                                                            |
| `@counterfact/runtime/msw`                   | MSW adapter interfaces.                                                                                      |
| `@counterfact/repl`                          | Embeddable REPL.                                                                                             |
| `@counterfact/tutorials`                     | Guided tours, editable exercise preparation, and lesson checks.                                              |
| `@counterfact/types`                         | Shared contracts for generated code and package integration.                                                 |
| `@counterfact/types/streaming-content-types` | Runtime constants identifying streaming media types.                                                         |

In generated projects, import schema-aware contracts and helpers from the
project's generated `types/index.js` entrypoint. The copied `counterfact-types/`
directory supplies shared implementation contracts used by generated files;
it does not require an installed `@counterfact/types` dependency. See
[generated code](../features/generated-code.md) for the public project types.

## Architecture overview

```
OpenAPI spec (YAML or JSON, local or URL)
        │
        ▼
┌──────────────────────┐
│ TypeScript Generator │  → routes/  (one .ts per path)
│                      │  → types/   (request/response interfaces)
└──────────────────────┘
        │
        ▼
┌──────────────────────┐
│  Counterfact facade  │  → composes the Koa HTTP server and route dispatch
│  + Hot Reload        │  → watches for file changes via chokidar
│  + REPL              │  → interactive terminal attached to live state
│  + Proxy             │  → optional passthrough to a real backend
└──────────────────────┘
```

The facade coordinates generation, runtime, and optional REPL startup. The Koa
adapter owns HTTP handling; terminal and tutorial behavior live in their own
packages.

## Package-level examples

The [repository package directory](https://github.com/counterfact/api-simulator/tree/main/packages) contains README files and runnable examples for individual packages.

The MSW entry point is an adapter interface. Its existence does not imply that the Node-oriented runtime can be loaded directly into a browser. The standard Counterfact workflow runs a real HTTP server.

For everyday simulator use, start with `counterfact`; use focused packages when embedding individual capabilities.
