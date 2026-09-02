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
  - ".github/workflows/**/*.yaml"
  - ".github/workflows/**/*.yml"
---

# Counterfact Maintenance Skill

## When to use this skill

Use this skill when finalizing contributor-facing changes that affect tests, diagnostics/errors, release semantics, docs, or compatibility guarantees.

## Files to inspect first

- `package.json` (canonical scripts)
- `AGENTS.md`
- `packages/counterfact/docs/reference.md`
- `packages/counterfact/docs/faq.md`
- `.changeset/*.md` (format examples)
- `packages/counterfact/test/**/*` for existing patterns/fixtures

## Existing conventions to follow

- Use `usingTemporaryFiles()` for filesystem-heavy tests.
- Keep tests focused by subsystem (`packages/counterfact/test/cli`, `packages/counterfact/test/server`, `packages/counterfact/test/typescript-generator`, `packages/counterfact/test/util`).
- Preserve documented behavior promises (e.g., regen preserves route edits; types are regenerated).
- For user-facing behavior changes: add a changeset and update docs under `packages/counterfact/docs/`.
- After Changesets versions workspace packages, run `yarn install --mode skip-build --no-immutable` so `yarn.lock` can match the new internal versions before immutable installation; CI enables Yarn immutability by default, so the explicit override is required in `release:version`.
- A push to `main` with no remaining changesets publishes the merged package versions automatically; a manual Release workflow dispatch is the retry and recovery path.
- Keep the `npm-publish` environment name, OIDC permission, and provenance setting aligned with the npm trusted-publisher configuration.
- Use OS-assigned ephemeral ports for tests that start network servers; fixed high ports can collide on shared CI hosts.
- When a status check is required by a merge-queue ruleset, configure its workflow to run on `merge_group` with `checks_requested`; a `pull_request`-only workflow leaves the queue's synthetic commit without that check and eventually times out.

## Black-box test boundary

Reserve `test-black-box/` for implementation-unaware behavioral tests that exercise Counterfact as a complete product through user-facing interfaces.
A test is black-box because it controls product inputs and observes product outputs without depending on implementation details, not because it runs in a particular process.
The product execution may cross several packages without the harness knowing or selecting which packages are involved.
These tests may be more sensitive to subtle regressions than they are helpful at pinpointing their source.

Gherkin feature files are the authoritative inventory of black-box behavior.
Each scenario should describe a coherent developer journey and preserve every distinct user-visible claim, while equal or stronger journey coverage should replace duplicate assertions.
Python under `test-black-box/` is limited to pytest-bdd scenario bindings, step glue, and lifecycle support; do not add standalone pytest test functions as a second behavioral inventory.
Create contracts and configurations inside the scenario's temporary project instead of relying on mutable state or shared checked-in fixtures.
Reuse one generated project and server within a scenario, but never share mutable state between scenarios.
Use dynamic ports, deterministic named examples, bounded polling with complete process diagnostics, and teardown that terminates every child process.

Allowed observation and control surfaces are:

- The shipped `counterfact` CLI's arguments, stdin, stdout, stderr, and exit status.
- HTTP requests to a server started through that CLI.
- Files generated or changed by that CLI.
- Keystrokes and terminal output from a CLI process attached to a real pseudo-terminal.

Do not put a test in `test-black-box/` if it does any of the following:

- Generates or runs a standalone consumer script whose purpose is to exercise `counterfact` or `@counterfact/*` package APIs directly.
- Imports package source files, private modules, or `dist` paths.
- Constructs an application, server, runner, registry, loader, or client directly instead of operating the shipped product.
- Mocks implementation internals or asserts private state, internal call order, or concrete implementation topology.

The test layers are intentionally complementary:

- Black-box tests detect externally observable behavioral drift, including regressions that emerge only across package boundaries.
- Unit and type tests isolate behavior and provide faster, more diagnostic failures.
- Package-consumer and contract tests exercise declared package exports directly.
- Packed-consumer and package-closure tests prove that published artifacts install with complete declared dependencies and exports.

A separate process is neither necessary nor sufficient evidence that a test is black-box.
Calling the shipped CLI from Python is valid; using Python only to launch a Node script that imports packages is a package-consumer test, not a product black-box test.
Writing an editable generated route and letting the shipped CLI load it remains a product black-box test, even when that route uses a documented handler type from `counterfact`.
Broad and focused tests may overlap when they protect behavior at different abstraction levels.

Before adding or approving a black-box test:

1. State the user-visible regression or behavior in one sentence.
2. Identify the product interface that a user would operate.
3. Launch the shipped product without importing application packages into the test harness or a standalone consumer script.
4. Assert only observable output such as terminal text, HTTP responses, exit status, or generated files.
5. Confirm the test fails with the regression present, not merely that it passes after the fix.
6. Search `test-black-box/` for generated consumer scripts, direct package imports, and private source or build paths:

   ```bash
   rg -n '_run_node_script|consume\.mjs|--eval|input-type=module|packages/.+/(src|dist)/' test-black-box
   rg -n '@counterfact/|import .*counterfact|from .*counterfact' test-black-box
   ```

For interactive CLI behavior, use a real pseudo-terminal and send the literal keystrokes a user would type.
If the required terminal facility is unavailable on an operating system, skip explicitly and ensure another CI operating system executes the test; do not replace the test with a direct function call.
Keep that operating-system skip scoped to the real-terminal scenario so non-interactive journeys continue to run cross-platform.

## Common mistakes to avoid

- Introducing direct fs imports in tests instead of `usingTemporaryFiles` helper.
- Treating a Python-launched Node consumer as a product black-box test because it runs in a child process.
- Testing a REPL completer callback directly instead of operating the CLI through a terminal.
- Adding a direct pytest black-box test instead of extending or adding a Gherkin journey.
- Sharing a generated project, fixed port, server process, or mutable contract across scenarios.
- Omitting focused tests because a broad black-box test already covers the behavior.
- Treating package-consumer coverage as proof that packed artifacts are complete.
- Shipping behavior changes without docs + changeset updates.
- Breaking backward compatibility unintentionally (CLI defaults, regeneration guarantees, response semantics).
- Relying only on broad tests; skip targeted tests for touched areas.
- Writing task-specific "decision logs" without turning repeatable lessons into durable instructions.

## Embedding learnings into guidance

- When a non-trivial task reveals repeatable guidance, update the relevant skill file in the same PR, or create a new skill if applicable.
- Put subsystem-specific learnings in the matching skill (`counterfact-cli-runtime`, `counterfact-runtime-architecture`, or `counterfact-generator-internals`).
- Put cross-cutting learnings in `AGENTS.md` only when they do not belong to a single subsystem skill.

## How to validate the change

- Baseline: `yarn lint:fix`, `yarn lint`, `yarn build`, `yarn test`.
- Run targeted tests for touched modules before full test run.
- If server startup or CLI behavior changed, run `yarn build` then `yarn test:black-box`.
- For black-box changes, run the boundary searches above and resolve or explicitly reclassify every finding in the touched scope.
- Ensure PR notes include manual acceptance tests with observable outcomes.
