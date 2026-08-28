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

## Repository structure

```text
packages/
  counterfact/                # Published package workspace
    src/
      app.ts                  # Main entry point; generation + server + REPL orchestration
      server/                 # Koa server, dispatcher, registry, hot-reload internals
      typescript-generator/   # OpenAPI parsing and TypeScript generation
      repl/                   # Interactive terminal for runtime state control
      migrate/                # Helpers for migrating generated route files
      util/                   # Shared utilities
    bin/counterfact.js        # CLI entry point
    test/                     # Jest unit tests
    templates/                # Generator scaffold templates
    docs/                     # Canonical user documentation
  types/src/                  # Shared types copied into generated projects
test-black-box/               # Gherkin journeys with Python harness and step glue
examples/                     # Checked consumer examples
site/                         # Documentation website
```

## Essential commands

| Task                          | Command                          |
| ----------------------------- | -------------------------------- |
| Install dependencies          | `yarn install --immutable`       |
| Build                         | `yarn build`                     |
| Type-check                    | `yarn typecheck`                 |
| Unit tests                    | `yarn test`                      |
| Product black-box tests       | `yarn test:black-box`            |
| Installed package smoke test  | `yarn test:packed-consumer`      |
| TypeScript type tests         | `yarn build && yarn test:tsd`    |
| Lint (check)                  | `yarn lint`                      |
| Lint (auto-fix)               | `yarn lint:fix`                  |
| Run against Petstore          | `yarn go:petstore`               |

## Development container

The repository's `.devcontainer` supplies the reproducible Linux development
environment used for contributor validation: Node 24, Corepack/Yarn 4, and
Python dependencies for black-box tests. Use the non-root `node` user and keep
the container limited to the intended repository mount; do not expose Docker,
host credentials, SSH agents, or production secrets.

Run `bash .devcontainer/verify.sh` inside the container for the Linux
CI-equivalent suite. Codex Desktop's native workspace sandbox remains separate
from the development container: use the devcontainer for reproducible
dependencies and tests, and use a dedicated Git worktree/branch for each task.

## New issue proposals

Never create GitHub issues directly. Propose them as Markdown files under `.github/issue-proposals/` and follow `.github/instructions/issue-proposals.instructions.md`.
