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
- `packages/counterfact/docs/api/cli.md` (CLI reference)

## Existing conventions to follow

- Keep `packages/counterfact/bin/counterfact.js` minimal: version gate + runtime capability probe + delegate to `runCli`.
- Keep CLI precedence explicit: CLI flags override config file values (`program.getOptionValueSource`).
- First-run prompts require no CLI arguments, an absent default config file (an empty file still counts as configured), interactive stdin and stdout, and a non-CI environment. Resolve config errors before offering the intro, and defer startup side effects until the user confirms project creation. Discover local contracts only after the user chooses their own document.
- Discover local specs with a bounded asynchronous walk in the CLI process, without changing cwd, dereferencing `$ref`, or fetching URLs. Skip symlinks, hidden, dependency, and build directories, and check paths against the starting directory. Treat these as practical local-project safeguards, not race-free filesystem confinement. Check cancellation and the time budget between operations; synchronous parsing cannot be forcibly interrupted. Test terminal prompts/cancellation through the shipped CLI on a real PTY, alongside noninteractive and configured startup regressions.
- Pass selected local specs with an explicit `./` prefix so URL-like filenames remain local and watched. Report the spec limit only when another supported spec is omitted.
- Treat sensitive values carefully in logs/telemetry (hash file locations, avoid raw secrets/paths).
- Keep telemetry personless and unlinkable from website identity. Product events use a locally generated anonymous installation identifier that rotates after 180 days plus a new session identifier for each process. Source identifiers use HMAC-SHA-256 with an independent per-install secret that is stored only in the mode-`0600` identity file, rotates with the installation identifier, and is never sent or used as the provider `distinctId`.
- Keep the CI and `COUNTERFACT_TELEMETRY_DISABLED=true` checks ahead of identity creation, location hashing, and provider construction so opt-out creates neither network traffic nor local telemetry state.
- Telemetry events and properties must pass through the facade's discriminated allow-list and be reconstructed from enumerated, non-sensitive fields. Never capture raw paths or URLs, OpenAPI documents, request paths or data, headers, tokens, free-form errors, project names, command arguments, or the private location-hash key.
- Report runtime activation through `RuntimeEventReporter` and inject the facade telemetry adapter at the Koa composition boundary; do not import PostHog into `@counterfact/runtime` or emit more than one `first_api_request_served` event per process.
- Preserve existing defaults where no action flags are passed (serve/repl/watch/generate/buildCache behavior).
- Wrap asynchronous startup work in the startup reporter so its transient spinner clears on both success and failure. Animate only on interactive stdout; keep redirected output free of cursor controls. `NO_COLOR` disables colour, not progress animation. Treat a reported terminal width of zero as unknown and use a fallback width. Keep progress within the terminal width, clear reflowed rows after resizing, and defer concurrent stdout/stderr notices until progress clears.
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
- Verify installed-package telemetry with a loopback-only collector, OS-assigned ports, a disposable `XDG_CONFIG_HOME`, and `--no-update-check`. Point the internal `POSTHOG_HOST` seam at the collector, accept gzip request bodies, place unique sentinels in every prohibited field, and assert both payload absence and zero requests/identity files under CI and explicit opt-out. Never let this test contact the live provider.
- For user-facing CLI behavior changes, update docs under `packages/counterfact/docs/` and add a changeset.
