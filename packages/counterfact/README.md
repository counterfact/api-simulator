<div align="center" markdown="1">

<h1><img src="https://raw.githubusercontent.com/counterfact/api-simulator/main/counterfact.svg" alt="Counterfact" border="0"></h1>

![MIT License](https://img.shields.io/badge/license-MIT-blue) [![Coverage Status](https://coveralls.io/repos/github/counterfact/api-simulator/badge.svg)](https://coveralls.io/github/counterfact/api-simulator) ![Swagger 2.0](https://img.shields.io/badge/Swagger-2.0-85EA2D) ![OpenAPI 3.0–3.2](https://img.shields.io/badge/OpenAPI-3.x-6BA539) [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/counterfact/api-simulator)

## Turn an OpenAPI document into an editable, stateful local API.

</div>

Counterfact generates TypeScript handlers and request/response types for supported OpenAPI operations, then starts a local server. Begin with schema-derived sample responses; add shared state, failures, latency, middleware, or selective proxying as your workflow needs them. Route and context files hot-reload while their in-memory state stays available.

Counterfact checks contract shape while giving you a path to shape the behavior. Start with schema-derived responses, then turn them into deterministic, stateful scenarios by editing the generated typed handlers and adding shared context. Model the workflow your client needs, not the real backend's internal complexity. You can explore in seconds and keep the behavior you author as a repeatable local or CI fixture.

## Run a live API in 60 seconds

```sh
npx counterfact@latest https://petstore3.swagger.io/api/v3/openapi.json api
```

This generates editable files in `api/`, starts the server at `http://localhost:3100`, serves Swagger UI at `http://localhost:3100/counterfact/swagger/`, and opens the live REPL. Exit with `.exit`, <kbd>Ctrl</kbd>+<kbd>D</kbd>, or <kbd>Ctrl</kbd>+<kbd>C</kbd> twice.

Requires Node.js 22 or newer. For a repeatable project or CI workflow, install Counterfact as a dev dependency and commit the lockfile:

```sh
npm install --save-dev counterfact
npx counterfact ./openapi.yaml api
```

## Start with the workflow you need

| When you need to…                      | You can…                                                         | Start here                                                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build ahead of your backend            | Create a record, read it later, and shape the failure paths      | [Build a stateful flow](./docs/first-10-minutes.md#build-a-stateful-flow)                                                                                       |
| Make failures repeatable               | Reset, fail, recover, and tear down the same way every run       | [Automate a deterministic test](./docs/first-10-minutes.md#automate-a-deterministic-test)                                                                       |
| Give a coding agent a reliable sandbox | Leave a resettable context and an HTTP test for review           | [Give an agent a verifiable task](./docs/first-10-minutes.md#give-an-agent-a-verifiable-task)                                                                   |
| Bring endpoints online gradually       | Keep one client base URL while paths move from local to upstream | [Run the checked hybrid path](https://github.com/counterfact/api-simulator/tree/main/examples/first-10-minutes#hybrid-path-ownership)                           |
| Keep the contract in the loop          | Regenerate types and catch drift in your normal type check       | [See a contract change reach a client](https://github.com/counterfact/api-simulator/tree/main/examples/first-10-minutes#see-a-contract-change-reach-the-client) |

The [first-10-minutes guide](./docs/first-10-minutes.md) includes the shared setup, reset and isolation rules, CI lifecycle, and the boundary between contract checks and behavior realism.

Prefer a complete artifact to copy? The [CI-checked first-10-minutes example](https://github.com/counterfact/api-simulator/tree/main/examples/first-10-minutes) contains a minimal OpenAPI contract, resettable context, typed handlers, real-HTTP test, lockfile, and type-check configuration.

## Confidence you can build on

| Where Counterfact helps               | What you get                                                                                                           | What remains yours                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Generated TypeScript types            | Supported status codes, media types, declared headers, and request/response shapes when your project runs a type check | The business rules that make the API truly yours                          |
| Request validation                    | Required query, header, and cookie parameters plus supported JSON/form bodies; detected mismatches return `400`        | Authentication, authorization, path-parameter schemas, and business rules |
| Response checks                       | Required response headers and their schema types, with advisory `response-type-error` details when something is off    | Response-body enforcement and production correctness                      |
| Your handlers, context, and scenarios | The state, rules, failures, reset behavior, and deterministic fixtures your workflow needs                             | Targeted real-backend and end-to-end coverage for the real service        |

Counterfact gives you a fast, contract-shaped world to build against. Keep targeted real-backend and end-to-end coverage for the parts only the real service can prove. See [how to make the workflow yours](./docs/first-10-minutes.md#make-it-yours-with-confidence) for the practical checklist.

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

[Changelog](https://github.com/counterfact/api-simulator/blob/main/CHANGELOG.md) · [Contributing](https://github.com/counterfact/api-simulator/blob/main/CONTRIBUTING.md) · [Security](https://github.com/counterfact/api-simulator/blob/main/SECURITY.md)

</div>
