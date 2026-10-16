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
- First-run prompts require no CLI arguments, an absent default config file (an empty file still counts as configured), interactive stdin and stdout, and a non-CI environment. Resolve config errors before offering the intro, and defer startup side effects until the user confirms project creation. Discover local contracts only after the user chooses their own document.
- Discover local specs with a bounded asynchronous walk in the CLI process, without changing cwd, dereferencing `$ref`, or fetching URLs. Skip symlinks, hidden, dependency, and build directories, and check paths against the starting directory. Treat these as practical local-project safeguards, not race-free filesystem confinement. Check cancellation and the time budget between operations; synchronous parsing cannot be forcibly interrupted. Test terminal prompts/cancellation through the shipped CLI on a real PTY, alongside noninteractive and configured startup regressions.
- Hands-on tutorials must advance from successful product actions, not typed command text or a saved file alone. Keep the ordinary REPL unchanged when browser instructions can observe app requests directly. Browser tutorials should preserve lesson/cart state only within the same running API session and offer a printed URL if browser launch fails. Keep example contracts in the shipped package and isolate generated examples from existing files. Validate generated browser script syntax and test the actual UI alongside real-terminal and HTTP journeys.
- Group related tutorial phases under a stable lesson title and number. Advance phases from observed responses, keep explicit navigation between concepts, and preserve the saved phase across reloads. Clear or replace feedback when the next action changes so completed edits and recovered failures do not leave contradictory instructions.
- Revisited lessons must work with retained handler edits and live inventory rather than assume pristine fixtures. Offer a context-specific recovery action when needed, and accept behaviorally equivalent experiment quantities instead of treating every departure from example values as an error.
- Saved-handler lesson checks must execute a fresh snapshot of the saved functions with separate context and inventory; never send hidden test purchases through the live shop. Match check results to the source revision and lesson before displaying them so a slow result cannot approve a newer edit. A successful check advances editing instructions, while actual shopper requests still earn purchase completion.
- Browser observations must compare real API snapshots rather than predict mutations or claim specific code executed. Serialize product refreshes with purchases, mark stale/invalid inventory explicitly, distinguish an unknown order confirmation from a rejected order, and preserve the cart for recovery. Render response data as text. Test automatic refresh and failure recovery with controlled responses as well as real CLI journeys.
- Pass selected local specs with an explicit `./` prefix so URL-like filenames remain local and watched. Report the spec limit only when another supported spec is omitted.
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
