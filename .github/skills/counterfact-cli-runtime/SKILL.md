---
name: counterfact-cli-runtime
description: >
  Update Counterfact CLI option behavior, config resolution, telemetry-safe
  startup handling, and bootstrap/runtime entrypoint flow.
applyTo:
  - "bin/counterfact.js"
  - "src/cli/**/*.ts"
  - "src/util/load-config-file.ts"
  - "test/cli/**/*.test.ts"
---

# Counterfact CLI Runtime Skill

## When to use this skill

Use this skill for CLI flags, option precedence, config file loading, startup diagnostics, Node/runtime bootstrap behavior, or telemetry option changes.

## Files to inspect first

- `bin/counterfact.js`
- `src/cli/run.ts`
- `src/cli/telemetry.ts`
- `src/util/load-config-file.ts`
- `test/cli/run.test.ts`
- `docs/reference.md` (CLI reference)

## Existing conventions to follow

- Keep `bin/counterfact.js` minimal: version gate + runtime capability probe + delegate to `runCli`.
- Keep CLI precedence explicit: CLI flags override config file values (`program.getOptionValueSource`).
- Treat sensitive values carefully in logs/telemetry (hash file locations, avoid raw secrets/paths).
- Preserve existing defaults where no action flags are passed (serve/repl/watch/generate/buildCache behavior).

## Common mistakes to avoid

- Adding heavy logic to `bin/counterfact.js` instead of `src/cli/`.
- Breaking positional argument shifting with `--spec` string mode.
- Logging tokens/secrets or raw private locations.
- Changing defaults without updating tests and docs in lockstep.

## How to validate the change

- Run: `yarn lint`, `yarn build`, `yarn test`.
- Run CLI-focused tests: `test/cli/run.test.ts`, `test/cli/telemetry.test.ts`, `test/cli/check-for-updates.test.ts`.
- For user-facing CLI behavior changes, update docs under `docs/` and add a changeset.
