---
name: counterfact-repo-basics
description: >
  Provide Counterfact repository orientation, high-level architecture, and the
  canonical command reference for install/build/test/lint workflows.
applyTo:
  - "**/*"
---

# Counterfact Repository Basics Skill

## When to use this skill

Use this skill when you need quick repository orientation, command references, or issue-proposal workflow rules.

## What Counterfact is

Counterfact is a TypeScript-based mock server generator that turns OpenAPI/Swagger specs into live, stateful mock APIs with hot reload, a REPL, and Swagger UI.

```bash
npx counterfact@latest https://petstore3.swagger.io/api/v3/openapi.json api
```

## Repository structure and ownership

```text
packages/
  types/                      # Dependency-light shared TypeScript contracts
  openapi/                    # OpenAPI loading, bundling, dereferencing, overlays
  generator/                  # Route, type, scenario, and template generation
  runtime/                    # Dispatch, registries, validation, hot reload, adapters
  client/                     # Immutable request builder and raw HTTP client
  repl/                       # Embeddable REPL over client and runtime contracts
  counterfact/                # Published facade, CLI, orchestration, migrations, docs
test-black-box/               # Gherkin journeys with Python harness and step glue
examples/                     # Checked consumer examples
site/                         # Documentation website
```

Read the root `README.md` for the package map and the affected package's `README.md` before changing a workspace. `packages/counterfact/src/app.ts` and `api-runner.ts` compose the focused packages; they do not own runtime or generator internals.

Counterfact packages follow one-way dependency boundaries. `types` is the leaf; `openapi` depends on `types`; `generator` and `runtime` are siblings; `client` depends on `openapi`; `repl` depends on `client` and narrow runtime contracts; and the `counterfact` facade may depend on all focused packages. Never deep-import another workspace's `src/` or `dist/`. `scripts/check-package-boundaries.mjs` is the executable authority.

## Essential commands

| Task                         | Command                                                 |
| ---------------------------- | ------------------------------------------------------- |
| Install dependencies         | `yarn install --immutable`                              |
| Build                        | `yarn build`                                            |
| Type-check                   | `yarn typecheck`                                        |
| Unit tests                   | `yarn test`                                             |
| Package boundary checks      | `yarn test:boundaries && yarn check:boundaries`         |
| Product black-box tests      | `yarn test:black-box`                                   |
| Installed package smoke test | `yarn test:packed-consumer`                             |
| Exact package closure tests  | `yarn test:package-closures`                            |
| TypeScript type tests        | `yarn build && yarn test:tsd`                           |
| Agent guidance integrity     | `yarn check:agent-guidance && yarn test:agent-guidance` |
| Lint (check)                 | `yarn lint`                                             |
| Lint (auto-fix)              | `yarn lint:fix`                                         |
| Run against Petstore         | `yarn go:petstore`                                      |

Use the focused package scripts (`test:client`, `test:generator`, `test:runtime`, and `test:repl`) while iterating. Use `lint:fix` only as an explicit repair step after reviewing lint output; it is not a read-only verification command.

## New issue proposals

Never create GitHub issues directly. Propose them as Markdown files under `.github/issue-proposals/` and follow `.github/instructions/issue-proposals.instructions.md`.
