# Contributing

## Where help is welcome

- **Feedback and questions:** [Start a discussion](https://github.com/pmcelhaney/counterfact/discussions) or [open an issue](https://github.com/pmcelhaney/counterfact/issues/new).
- **Documentation and examples:** Improve first-run guidance, task-oriented documentation, package examples, or the documentation site.
- **Tests:** Add focused regression coverage, strengthen package-consumer contracts, or extend user-visible black-box journeys.
- **Features and bug fixes:** Check the [issues list](https://github.com/pmcelhaney/counterfact/issues) and coordinate on the issue before starting a large change.

Coding agents follow a different issue workflow: they must propose new issues through `.github/issue-proposals/` as directed by `AGENTS.md`; they do not create issues directly.

## Development

This is a Yarn 4 workspace monorepo. The published application is in
`packages/counterfact`; repository-wide tooling, examples, black-box tests, and
the documentation website remain at the root.

```sh
git clone git@github.com:pmcelhaney/counterfact.git
cd counterfact
corepack enable
yarn install --immutable
yarn build
yarn lint
yarn typecheck
yarn test
```

The root `.mise.toml` and CI use Node 24, while `package.json` is authoritative for the complete supported engine range and pinned Yarn version. Root scripts coordinate builds and checks, so contributors do not need to change directories for the standard workflow.

The repository is organized as focused packages:

- [`@counterfact/types`](./packages/types/README.md) owns dependency-light shared contracts.
- [`@counterfact/openapi`](./packages/openapi/README.md) owns OpenAPI loading and overlays.
- [`@counterfact/generator`](./packages/generator/README.md) owns route and type generation.
- [`@counterfact/runtime`](./packages/runtime/README.md) owns dispatch, registries, hot reload, and adapters.
- [`@counterfact/client`](./packages/client/README.md) owns immutable request building and raw HTTP requests.
- [`@counterfact/repl`](./packages/repl/README.md) owns the embeddable terminal experience.
- [`counterfact`](./packages/counterfact/README.md) remains the product facade, CLI, orchestration layer, and canonical user documentation.

Do not deep-import another workspace's `src/` or `dist/`. Run `yarn check:boundaries` to validate the allowed dependency direction.

Coding agents must also follow [`AGENTS.md`](./AGENTS.md), including the isolated-worktree, pull-request, and repository-learning requirements.

### Mutation testing

Mutation testing runs against one workspace package at a time so reports stay actionable and CI can process packages in parallel.
Build the workspaces before mutation testing because integration tests consume compiled dependencies from other packages.

```sh
yarn build
yarn test:mutation:dry --package openapi
yarn test:mutation --package openapi
yarn test:mutation:incremental --package openapi
```

The supported package names are `client`, `counterfact`, `generator`, `openapi`, `repl`, and `runtime`.
Omit `--package` to run all mutable production packages together.
Use `--force` with the incremental command to refresh every mutant instead of reusing unchanged results.
Detailed HTML and JSON reports are written to `reports/mutation/<package>/` and are not committed.

The mutation-testing workflow currently runs on Monday mornings and by manual dispatch rather than as a required pull-request check.
After two stable full baselines, maintainers can record per-package thresholds and enable the planned no-regression pull-request gate.

Small pull requests are welcome. Explain the observable change, run the checks appropriate to the affected package, and call out any verification that could not be completed locally.
