---
name: counterfact-client-repl
description: >
  Change the immutable request builder, raw HTTP client, or embeddable REPL
  while preserving package boundaries and interactive behavior.
applyTo:
  - "packages/client/src/**/*.ts"
  - "packages/client/test/**/*.test.ts"
  - "packages/repl/src/**/*.ts"
  - "packages/repl/test/**/*.test.ts"
---

# Counterfact Client and REPL Skill

## When to use this skill

Use this skill for request-catalog behavior, immutable request building, raw HTTP requests, REPL globals, completion, commands, scenarios, or event reporting.

## Files to inspect first

- `packages/client/README.md`
- `packages/client/src/route-builder.ts`
- `packages/client/src/route-catalog.ts`
- `packages/repl/README.md`
- `packages/repl/src/repl.ts`
- `packages/repl/test/repl.test.ts`

## Existing conventions to follow

- Keep request builders immutable: configuration methods return new builders so requests can be safely branched.
- Keep `@counterfact/client` usable without starting the simulator or REPL.
- Give the REPL narrow client and runtime contracts; do not import the facade or CLI telemetry policy.
- Report REPL events through the guarded callback, omit command arguments, and never let reporter failure interrupt the session.
- Preserve single-API and grouped multi-API globals, scenario behavior, and literal terminal interaction.

## Common mistakes to avoid

- Mutating a request builder in place.
- Making the client depend on runtime or the `counterfact` facade.
- Testing interactive behavior only through a completer or command callback instead of a real pseudo-terminal journey.
- Logging REPL command arguments or allowing observability failures to break commands.

## How to validate the change

- Run `yarn test:client` or `yarn test:repl` for the affected package.
- Run `yarn test:client-packed` or `yarn test:repl-packed` when exports or packaged behavior change.
- Run `yarn lint`, `yarn typecheck`, `yarn build`, `yarn test`, and `yarn check:boundaries`.
- For user-visible interactive changes, add or update a PTY black-box journey, update user docs, and add a changeset.
