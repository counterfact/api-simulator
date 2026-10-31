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
- Keep tutorial content and behavior in `@counterfact/tutorials`. The CLI owns menu/port selection, simulator startup, browser launch, and telemetry transport, and consumes the package root export. For lesson/UI changes, read [tutorial guidance](../counterfact-tutorials/SKILL.md). Verify installed tour helpers through the packed-consumer check so generated routes cannot depend on CLI internals.
- Pass selected local specs with an explicit `./` prefix so URL-like filenames remain local and watched. Report the spec limit only when another supported spec is omitted.
- Tutorial milestone reporting stays in `@counterfact/tutorials` and reaches the CLI through the `counterfact:walkthrough` diagnostics channel; the CLI owns telemetry transport and opt-out handling. Accept only bounded milestone names and phase numbers, use a temporary simulator-session identity, deduplicate reloads/revisits, and distinguish reaching the end from completing the exercises.
- Treat sensitive values carefully in logs/telemetry (hash file locations, avoid raw secrets/paths).
- Preserve existing defaults where no action flags are passed (serve/repl/watch/generate/buildCache behavior).
- Wrap asynchronous startup work in the startup reporter so its transient spinner clears on both success and failure. Animate only on interactive stdout; keep redirected output free of cursor controls. `NO_COLOR` disables colour, not progress animation. Treat a reported terminal width of zero as unknown and use a fallback width. Keep progress within the terminal width, clear reflowed rows after resizing, and defer concurrent stdout/stderr notices until progress clears.
- Keep startup status truthful and compact: report only work that has actually completed, do not expose local input/output paths in normal status lines, and use ANSI colour only for an interactive stdout that has not opted out through `NO_COLOR`.

## Common mistakes to avoid

- Adding heavy logic to `packages/counterfact/bin/counterfact.js` instead of `packages/counterfact/src/cli/`.
- Breaking positional argument shifting with `--spec` string mode.
- Logging tokens/secrets or raw private locations.
- Changing defaults without updating tests and docs in lockstep.

## How to validate the change

- Run: `yarn lint`, `yarn build`, `yarn test`.
- Run CLI-focused tests: `packages/counterfact/test/cli/run.test.ts`, `packages/counterfact/test/cli/telemetry.test.ts`, `packages/counterfact/test/cli/check-for-updates.test.ts`.
- For user-facing CLI behavior changes, update docs under `packages/counterfact/docs/` and add a changeset.
