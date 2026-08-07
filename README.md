<div align="center" markdown="1">

<h1><img src="./counterfact.svg" alt="Counterfact" border="0"></h1>

## Turn an OpenAPI document into an editable, stateful local API.

</div>

Counterfact is organized as a monorepo. The published `counterfact` package,
its complete overview, and its canonical user documentation live in
[`packages/counterfact`](./packages/counterfact/README.md).

- [Install and use Counterfact](./packages/counterfact/README.md)
- [Browse user documentation](./packages/counterfact/docs/getting-started.md)
- [Contribute](./CONTRIBUTING.md)
- [Review architecture decisions](./docs/adr/)

The root package is private and exists only to coordinate workspace builds,
tests, releases, examples, and the documentation website.

Focused workspace packages:

- [`@counterfact/client`](./packages/client/README.md) — reusable,
  OpenAPI-aware HTTP requests without the simulator or REPL.
- [`@counterfact/generator`](./packages/generator/README.md) — route scaffolds,
  generated TypeScript contracts, scenarios, and compatible shared templates.
- [`@counterfact/openapi`](./packages/openapi/README.md) — standalone OpenAPI
  loading, bundling, dereferencing, and overlays.
- [`@counterfact/repl`](./packages/repl/README.md) — an embeddable Node.js REPL
  over focused client and runtime contracts.
- [`@counterfact/runtime`](./packages/runtime/README.md) — route dispatch,
  registries, validation, hot reload, proxying, and Koa/MSW adapters.
- [`@counterfact/types`](./packages/types/README.md) — shared TypeScript
  contracts used by Counterfact internals and generated handlers.
