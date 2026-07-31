<div align="center" markdown="1">

<h1><img src="./counterfact.svg" alt="Counterfact" border="0"></h1>

![MIT License](https://img.shields.io/badge/license-MIT-blue) [![Coverage Status](https://coveralls.io/repos/github/counterfact/api-simulator/badge.svg)](https://coveralls.io/github/counterfact/api-simulator) ![Swagger 2.0](https://img.shields.io/badge/Swagger-2.0-85EA2D) ![OpenAPI 3.0–3.2](https://img.shields.io/badge/OpenAPI-3.x-6BA539) [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/counterfact/api-simulator)

## Turn an OpenAPI document into an editable, stateful local API.

</div>

Counterfact generates TypeScript handlers and request/response types for supported OpenAPI operations, then starts a local server. Begin with schema-derived sample responses; add shared state, failures, latency, middleware, or selective proxying as your workflow needs them. Route and context files hot-reload while their in-memory state stays available.

Counterfact checks contract shape; you supply business behavior. Generated samples are useful for exploration, but they are not deterministic test data or a realistic implementation by themselves.

## Run a live API in 60 seconds

```sh
npx counterfact@latest https://petstore3.swagger.io/api/v3/openapi.json api
```

This generates editable files in `api/`, starts the server at `http://localhost:3100`, serves Swagger UI at `http://localhost:3100/counterfact/swagger/`, and opens the live REPL. Exit with `.exit`, <kbd>Ctrl</kbd>+<kbd>D</kbd>, or <kbd>Ctrl</kbd>+<kbd>C</kbd> twice.

Requires Node.js 22 or newer. The remote Petstore example also requires network access. For a repeatable project or CI workflow, install Counterfact as a dev dependency and commit the lockfile:

```sh
npm install --save-dev counterfact
npx counterfact ./openapi.yaml api
```

## Choose your first 10 minutes

| Your goal                                  | First proof to build                                                       | Start here                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Build a frontend before the backend exists | Create a record, read it on a later request, then force a failure          | [Build a stateful flow](./docs/first-10-minutes.md#build-a-stateful-flow)                     |
| Reproduce a QA failure reliably            | Reset state, force a failure, retry successfully, and tear the server down | [Automate a deterministic test](./docs/first-10-minutes.md#automate-a-deterministic-test)     |
| Give a coding agent a bounded API world    | Leave a resettable context and an HTTP test for a human reviewer           | [Give an agent a verifiable task](./docs/first-10-minutes.md#give-an-agent-a-verifiable-task) |
| Replace simulated endpoints gradually      | Keep one client base URL while choosing which paths are local or upstream  | [Mix simulated and real paths](./docs/patterns/hybrid-proxy.md)                               |
| Catch contract drift before integration    | Regenerate types and make handler mismatches fail your normal type check   | [Make the spec executable](./docs/patterns/executable-spec.md)                                |

The [first-10-minutes guide](./docs/first-10-minutes.md) includes the shared setup, reset and isolation rules, CI lifecycle, and the boundary between contract checks and behavior realism.

## What Counterfact checks

| Layer                                 | What it proves                                                                                                               | What it does not prove                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Generated TypeScript types            | Supported status codes, media types, declared headers, and request/response shapes when your project runs a TypeScript check | That handler business rules match the real service                            |
| Runtime request validation            | Required query, header, and cookie parameters plus supported JSON/form bodies; detected mismatches return `400`              | Authentication, authorization, path-parameter schemas, or business rules      |
| Runtime response checks               | Required response headers and their schema types; problems appear as advisory `response-type-error` headers                  | Response-body validity or enforcement—the original response is still returned |
| Your handlers, context, and scenarios | The state, rules, failures, reset behavior, and deterministic fixtures you implement                                         | Production correctness without targeted real-backend and end-to-end checks    |

Counterfact complements real-backend testing; it does not replace it. See [contract checks and behavior boundaries](./docs/first-10-minutes.md#know-what-is-guaranteed) for the adoption checklist.

## Project lifecycle

- Commit your OpenAPI document, editable `routes/`, scenarios, and usually the generated `types/` so collaborators share a working contract snapshot.
- Regeneration overwrites generated types and may append scaffolding for newly added operations; it preserves existing handler bodies unless you explicitly use a destructive option such as `--prune`.
- In-memory context survives hot reload. A new process creates fresh context, and its constructor or `startup` scenario defines the initial state.
- Counterfact executes TypeScript route files, but it does not run a TypeScript type-check step for you. Include generated files in your project and run your normal type check in CI.
- Use a user-defined `reset()` in test setup, and use separate server instances and ports for parallel workers.

## Documentation

- [Getting started](./docs/getting-started.md) – Generated files, state, REPL, proxying, and spec changes
- [Usage](./docs/usage.md) – Feature map
- [Patterns](./docs/patterns/index.md) – Reusable development and testing workflows
- [Reference](./docs/reference.md) – `$` API, CLI flags, and architecture
- [FAQ](./docs/faq.md) – State, types, validation, and regeneration
- [How it compares](./docs/comparison.md) – json-server, WireMock, Prism, Microcks, and MSW
- [Example repository](https://github.com/counterfact/example-petstore) – A larger Petstore implementation

<div align="center" markdown="1">

[Changelog](./CHANGELOG.md) · [Contributing](./CONTRIBUTING.md) · [Security](./SECURITY.md)

</div>
