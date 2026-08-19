---
name: counterfact-maintenance
description: >
  Keep contributor changes aligned with repository test patterns, diagnostics,
  black-box test boundaries, release/versioning workflow, documentation
  requirements, and compatibility.
applyTo:
  - "packages/counterfact/src/**/*.ts"
  - "packages/counterfact/test/**/*.ts"
  - "packages/counterfact/docs/**/*.md"
  - "test-black-box/**/*.py"
  - "docs/**/*.md"
  - ".changeset/*.md"
---

# Counterfact Maintenance Skill

## When to use this skill

Use this skill when finalizing contributor-facing changes that affect tests, diagnostics/errors, release semantics, docs, or compatibility guarantees.

## Files to inspect first

- `package.json` (canonical scripts)
- `.github/copilot-instructions.md`
- `packages/counterfact/docs/reference.md`
- `packages/counterfact/docs/faq.md`
- `.changeset/*.md` (format examples)
- `packages/counterfact/test/**/*` for existing patterns/fixtures

## Existing conventions to follow

- Use `usingTemporaryFiles()` for filesystem-heavy tests.
- Keep tests focused by subsystem (`packages/counterfact/test/cli`, `packages/counterfact/test/server`, `packages/counterfact/test/typescript-generator`, `packages/counterfact/test/util`).
- Preserve documented behavior promises (e.g., regen preserves route edits; types are regenerated).
- For user-facing behavior changes: add a changeset and update docs under `packages/counterfact/docs/`.

## Black-box test boundary

Reserve `test-black-box/` for tests that exercise Counterfact only through interfaces available to an end user.
A separate Node process is not sufficient evidence that a test is black-box.

Allowed observation and control surfaces are:

- The shipped `counterfact` CLI's arguments, stdin, stdout, stderr, and exit status.
- HTTP requests to a server started through that CLI.
- Files generated or changed by that CLI.
- Keystrokes and terminal output from a CLI process attached to a real pseudo-terminal.

Do not put a test in `test-black-box/` if it does any of the following:

- Generates or evaluates JavaScript that imports `counterfact` or `@counterfact/*` packages.
- Imports `dist` files or calls exported functions such as `counterfact()`, `createCompleter()`, `Registry`, or `Dispatcher` directly.
- Constructs an application, server, runner, registry, loader, or client inside the test process to stand in for the shipped product.
- Runs TypeScript solely to check declarations or package exports.

Classify those as package-consumer, integration, contract, or type tests and place them in the corresponding package suite or packed-consumer workflow.
Calling `node packages/counterfact/bin/counterfact.js ...` is valid because Node is launching the shipped CLI; calling `node consume.mjs` is not a product black-box test when `consume.mjs` imports product code.

Before adding or approving a black-box test:

1. State the user-visible regression or behavior in one sentence.
2. Identify the external interface that a user would operate.
3. Launch the shipped CLI without importing application modules into the test harness.
4. Assert only observable output: terminal text, HTTP responses, exit status, or generated files.
5. Confirm the test fails with the regression present, not merely that it passes after the fix.
6. Search `test-black-box/` for direct package imports, generated consumer scripts, Node evals, and direct `dist` imports:

   ```bash
   rg -n '_run_node_script|consume\.mjs|--eval|input-type=module|@counterfact/|dist/app\.js' test-black-box
   ```

For interactive CLI behavior, use a real pseudo-terminal and send the literal keystrokes a user would type.
If the required terminal facility is unavailable on an operating system, skip explicitly and ensure another CI operating system executes the test; do not replace the test with a direct function call.

## Common mistakes to avoid

- Introducing direct fs imports in tests instead of `usingTemporaryFiles` helper.
- Calling a package API from a child Node process and labeling it black-box.
- Testing a REPL completer callback directly instead of operating the CLI through a terminal.
- Shipping behavior changes without docs + changeset updates.
- Breaking backward compatibility unintentionally (CLI defaults, regeneration guarantees, response semantics).
- Relying only on broad tests; skip targeted tests for touched areas.
- Writing task-specific "decision logs" without turning repeatable lessons into durable instructions.

## Embedding learnings into guidance

- When a non-trivial task reveals repeatable guidance, update the relevant skill file in the same PR, or create a new skill if applicable.
- Put subsystem-specific learnings in the matching skill (`counterfact-cli-runtime`, `counterfact-runtime-architecture`, or `counterfact-generator-internals`).
- Put cross-cutting learnings in `.github/copilot-instructions.md` only when they do not belong to a single subsystem skill.

## How to validate the change

- Baseline: `yarn lint:fix`, `yarn lint`, `yarn build`, `yarn test`.
- Run targeted tests for touched modules before full test run.
- If server startup or CLI behavior changed, run `yarn build` then `yarn test:black-box`.
- For black-box changes, run the boundary search above and resolve or explicitly reclassify every finding in the touched scope.
- Ensure PR notes include manual acceptance tests with observable outcomes.
