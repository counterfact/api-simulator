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
src/
  app.ts                      # Main entry point; generation + server + REPL orchestration
  server/                     # Koa server, dispatcher, registry, hot-reload internals
  typescript-generator/       # OpenAPI parsing and TypeScript generation
  counterfact-types/          # Public API types exposed to route-handler authors
  repl/                       # Interactive terminal for runtime state control
  migrate/                    # Helpers for migrating generated route files
  client/                     # Built-in dashboard/docs page templates
  util/                       # Shared utilities
bin/
  counterfact.js              # CLI entry point
test/                         # Jest unit tests
test-black-box/               # Python black-box integration tests
templates/                    # Generator scaffold templates
```

## Essential commands

| Task                          | Command                          |
| ----------------------------- | -------------------------------- |
| Install dependencies          | `yarn install --frozen-lockfile` |
| Build                         | `yarn build`                     |
| Unit tests                    | `yarn test`                      |
| Black-box (integration) tests | `yarn test:black-box`            |
| TypeScript type tests         | `yarn build && yarn test:tsd`    |
| Lint (check)                  | `yarn lint`                      |
| Lint (auto-fix)               | `yarn lint:fix`                  |
| Run against Petstore          | `yarn go:petstore`               |

## New issue proposals

Never create GitHub issues directly. Propose them as Markdown files under `.github/issue-proposals/` and follow `.github/instructions/issue-proposals.instructions.md`.
