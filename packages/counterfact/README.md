# Build the frontend. Don’t wait for the backend.

Counterfact turns an OpenAPI document into a useful local API in one command.
It is for frontend developers who need to build while the real backend is
incomplete, unavailable, unstable, or owned by another team.

```sh
npx counterfact@latest https://petstore3.swagger.io/api/v3/openapi.json api
```

The command creates editable route files and generated TypeScript contracts in
`api/`, then starts a local server at `http://localhost:3100`. Supported
operations return schema-derived sample data immediately, so the frontend can
make a real browser request before anyone edits a handler:

```ts
const response = await fetch("http://localhost:3100/pet/1");
const pet = await response.json();
```

Requires Node.js 22 or newer. Counterfact supports Swagger 2.0 and OpenAPI
3.0, 3.1, and 3.2. For a project or CI workflow, install Counterfact as a dev
dependency and commit the lockfile:

```sh
npm install --save-dev counterfact
npx counterfact ./openapi.yaml api
```

## Add behavior only when you need it

Generated responses are the starting point. Replace a route with a custom
response when a screen needs one; add small shared state for a create/read
flow; then introduce failures, latency, proxying, tests, or the REPL only as
the workflow calls for them. Counterfact hot-reloads route changes while the
local API is running.

## Documentation

- [Getting started](./docs/getting-started.md) — the shortest path from OpenAPI document to browser request.
- [First 10 minutes](./docs/first-10-minutes.md) — add a small stateful workflow and one failure.
- [Usage](./docs/usage.md) — guides grouped by frontend, team/test, advanced, and reference work.
- [Reference](./docs/reference.md) — CLI flags, response builders, generated files, and programmatic API.
- [Patterns](./docs/patterns/index.md) — focused workflows, including failures, latency, proxying, and tests.
- [Without OpenAPI](./docs/features/without-openapi.md) — the deeper alternative when no OpenAPI document exists.

For a complete checked-in example, see the
[verified first-10-minutes example](https://github.com/counterfact/api-simulator/tree/main/examples/first-10-minutes).

[Changelog](https://github.com/counterfact/api-simulator/blob/main/packages/counterfact/CHANGELOG.md)
· [Contributing](https://github.com/counterfact/api-simulator/blob/main/CONTRIBUTING.md)
· [Security](https://github.com/counterfact/api-simulator/blob/main/SECURITY.md)
