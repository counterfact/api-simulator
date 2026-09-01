# Counterfact

## Build the frontend. Don’t wait for the backend.

Counterfact turns an OpenAPI document into a useful local API in one command.
The published package and canonical user documentation live in
[`packages/counterfact`](./packages/counterfact/README.md).

- [Start with the beginner guide](./packages/counterfact/docs/getting-started.md)
- [Install and use Counterfact](./packages/counterfact/README.md)
- [Browse documentation by task](./packages/counterfact/docs/usage.md)
- [Run the React and Vite example](./examples/react-vite/README.md) — `examples/react-vite/`; starts Counterfact and Vite in two terminals.
- [Run the Playwright error-states example](./examples/playwright-error-states/README.md) — `examples/playwright-error-states/`; installs Chromium and verifies three browser states.
- [Browse the packaged examples guides](./packages/counterfact/docs/examples/index.md)
- [Contribute](./CONTRIBUTING.md)
- [Review architecture decisions](./docs/adr/)

This repository is a Yarn workspace monorepo. Its root package is private and
coordinates builds, tests, releases, examples, and the documentation site.

Focused workspace packages:

- [`@counterfact/client`](./packages/client/README.md) — reusable, OpenAPI-aware HTTP requests without the simulator or REPL.
- [`@counterfact/generator`](./packages/generator/README.md) — route scaffolds, generated TypeScript contracts, scenarios, and compatible shared templates.
- [`@counterfact/openapi`](./packages/openapi/README.md) — standalone OpenAPI loading, bundling, dereferencing, and overlays.
- [`@counterfact/repl`](./packages/repl/README.md) — an embeddable Node.js REPL over focused client and runtime contracts.
- [`@counterfact/runtime`](./packages/runtime/README.md) — route dispatch, registries, validation, hot reload, proxying, and Koa/MSW adapters.
- [`@counterfact/types`](./packages/types/README.md) — shared TypeScript contracts used by Counterfact internals and generated handlers.
