---
name: counterfact-cli-runtime
description: >
  Update Counterfact CLI option behavior, config resolution, telemetry-safe
  startup handling, and bootstrap/runtime entrypoint flow.
applyTo:
  - "packages/counterfact/bin/counterfact.js"
  - "packages/counterfact/src/cli/**/*.ts"
  - "packages/counterfact/src/util/load-config-file.ts"
  - "packages/counterfact/test/cli/**/*.test.ts"
---

# Counterfact CLI Runtime Skill

## When to use this skill

Use this skill for CLI flags, option precedence, config file loading, startup diagnostics, Node/runtime bootstrap behavior, or telemetry option changes.

## Files to inspect first

- `packages/counterfact/bin/counterfact.js`
- `packages/counterfact/src/cli/run.ts`
- `packages/counterfact/src/cli/telemetry.ts`
- `packages/counterfact/src/util/load-config-file.ts`
- `packages/counterfact/test/cli/run.test.ts`
- `packages/counterfact/docs/reference.md` (CLI reference)

## Existing conventions to follow

- Keep `packages/counterfact/bin/counterfact.js` minimal: version gate + runtime capability probe + delegate to `runCli`.
- Keep CLI precedence explicit: CLI flags override config file values (`program.getOptionValueSource`).
- Treat sensitive values carefully in logs/telemetry (hash file locations, avoid raw secrets/paths).
- Keep telemetry personless and unlinkable from website identity. Product events use a locally generated anonymous installation identifier that rotates after 180 days plus a new session identifier for each process; CI and `COUNTERFACT_TELEMETRY_DISABLED=true` remain hard opt-outs.
- Telemetry properties must be enumerated and non-sensitive. Never capture raw paths or URLs, OpenAPI documents, request paths or data, headers, tokens, free-form errors, project names, or command arguments.
- Report runtime activation through `RuntimeEventReporter` and inject the facade telemetry callback at the Koa composition boundary; do not import PostHog into `@counterfact/runtime` or emit more than one `first_api_request_served` event per process.
- Preserve existing defaults where no action flags are passed (serve/repl/watch/generate/buildCache behavior).
- Keep startup status truthful and compact: report only work that has actually completed, do not expose local input/output paths in normal status lines, and use ANSI colour only for an interactive stdout that has not opted out through `NO_COLOR`.

## Common mistakes to avoid

- Adding heavy logic to `packages/counterfact/bin/counterfact.js` instead of `packages/counterfact/src/cli/`.
- Breaking positional argument shifting with `--spec` string mode.
- Logging tokens/secrets or raw private locations.
- Giving each telemetry event a new identity, which prevents session and retention analysis, or using a stable identity that does not rotate.
- Changing defaults without updating tests and docs in lockstep.

## How to validate the change

- Run: `yarn lint`, `yarn build`, `yarn test`.
- Run CLI-focused tests: `packages/counterfact/test/cli/run.test.ts`, `packages/counterfact/test/cli/telemetry.test.ts`, `packages/counterfact/test/cli/check-for-updates.test.ts`.
- For user-facing CLI behavior changes, update docs under `packages/counterfact/docs/` and add a changeset.
