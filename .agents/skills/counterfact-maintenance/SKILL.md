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
  - "site/**"
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
- `packages/counterfact/docs/api.md`
- `packages/counterfact/docs/faq.md`
- `.changeset/*.md` (format examples)
- `packages/counterfact/test/**/*` for existing patterns/fixtures

## Existing conventions to follow

- Root `go:*` launchers that use package-relative fixture paths must delegate to the package's script so the working directory matches those paths. Keep multi-API and multi-version demo output directories separate to avoid stale generated handlers crossing between examples.
- Write user docs as direct instructions with concrete examples. Introduce OpenAPI with a brief mention of its former name, Swagger, then use “spec” naturally. Prefer “your code” or “a class you write” over “authored behavior.” Explain limitations where they affect the task; avoid repeated disclaimers, abstract process language, and unsupported marketing claims. Choose headings for the subject rather than repeating a fixed template on every guide.

- When spawning Yarn from a package script, use the Yarn command on PATH with Windows command-shim handling. Yarn 4 can set `npm_execpath` to a shell wrapper; passing that path to Node treats shell code as JavaScript. Validate the runner with `yarn test:build` on both CI operating systems.
- Keep the root development build stages aligned with `packages/counterfact/package.json` build order and commands. Preserve the self-contained workspace build for packaging; repository-only progress scripts must not become required files in published packages.

- Preserve historical experiment inputs in `counterfact/historical-experiments` rather than the maintained product tree. Pin external evidence to a full commit and retain its hash manifest and result snapshot locally so site builds stay offline. Verify the archive bytes against that pin with `cd site && npm run verify:experiment-archive -- /path/to/archive` when migrating or changing evidence; `verify:audit` checks local integrity and pin consistency, not external bytes. Keep historical dependency upgrades separate from preserved runs.

- Keep `catchmydrift.config.json` document-specific: connect each selected document
  to the implementation, configuration, and tests it describes; use package-wide
  groups only for package or product overviews. Navigation and agent-guidance
  documents may relate to their referenced Markdown rather than unrelated code.
  After changing mappings, validate the installed schema, check for unmatched
  patterns or overlapping watches, and audit both missing relevant files and
  unrelated associations. Run `yarn check:drift`; exit 1 requests document review,
  while exit 2 indicates a configuration or operational failure. Never mark
  documents reviewed solely to silence drift or add CI enforcement without
  assessing the existing document-review backlog.
  When watched documents move, retarget their watch rules and related groups,
  compare their contents and related tracked files with the recorded assessment,
  and use the official review command for verified moved documents. Remove only
  their obsolete state keys; a rename alone does not establish a new review.

- Run package packing/prepack checks separately from unit and product suites that consume workspace `dist` output. Prepack rebuilds can remove those files while another suite is loading them, causing false missing-module failures. Finish the package check before starting those suites.
- `catchmydrift@0.1.0` review state is an unversioned map of watched paths to reachable full commit SHAs. When migrating legacy snapshot records, recover the historical commit that established each record and verify its recorded related-file blobs before retaining that baseline. Do not substitute tokens, blob hashes, or the current HEAD for an unverified review. Run the checker after migration and report outstanding drift separately from state/configuration failures.

- Quote glob arguments in package scripts when the receiving tool accepts the pattern.
  In particular, keep the `test:tsd` file pattern quoted: shell expansion of
  multiple files can turn an extra path into tsd's positional working directory.
- Execute substantial documentation recipes against the exact published version or commit they instruct readers to use. A source package version can match npm while exposing unreleased APIs; verify public method availability and mark source-only recipes with a reproducible checkout setup. Verify externally linked contracts at their pinned URL, and exercise both the failing and repaired steps of typecheck examples.
- Validate copyable handler examples against generated imports and the actual HTTP method's inputs, not only TypeScript syntax. For linked onboarding lessons, make the running-process, project-directory, and contract handoff explicit; an independently runnable command may still fail when followed immediately after the preceding lesson.
- User documentation ships in the npm package as well as the site. Keep the package `files` allowlist and `test/package/fixtures/pack-files.json` aligned with new pages; inspect inventory changes and run the packed-consumer check after adding documentation paths.
- Keep introductory walkthroughs in a linked manual chapter, with setup and discovery rules in `docs/api/cli.md`; preserve the direct OpenAPI quick start when integrating older onboarding changes.
- In build-up tutorials, start at the real generated scaffold and keep tutorial infrastructure separate from learner-authored behavior. Validate incomplete states as well as the final implementation; saved-file probes must use isolated state, and preview navigation must never apply prerequisite code or seed live state implicitly. When a tutorial prepares code, show its exact diff before writing, require an explicit apply action, update the proposal with the applied result, and reject stale previews if the learner saves in the meantime. Share the transformation between preview and apply, preserve learner edits, and leave the central behavior as a focused exercise. Conversational guides must retain proposals, approval replies, results, and quiz feedback in chronological order across reloads; reveal follow-up exercises only after their supporting edits succeed. Record explicit UI actions separately from automatic follow-up requests, and describe HTTP outcomes only from actual responses. Attach immutable request/response snapshots to the initiating action with a handler link and collapsed details; retain failed or interrupted exchanges without inventing a response. Keep file-change attribution separate from lesson completion. Capture the generated baseline first, distinguish approved tutor writes from learner saves, and retain both sides of each diff without collecting unrelated project files or sending source text through telemetry. Version lesson protocols when changing progression and retain helper compatibility for already generated projects. If inserting lessons changes numeric checkpoints, keep the prior phase inventory for existing journals and telemetry callers rather than interpreting their progress with the new numbering.
- Separate durable tutorial lesson checkpoints from runtime observations. Returning projects must resume without reverting evolved handlers; cart, quiz, and HTTP observations need a fresh session. Validate incomplete implementations with inputs that distinguish the provided stub from the intended behavior, and keep feedback attached to the method that failed. Preserve disclosure choices when rerendering a persistent transcript.
- Guided exercises describe the edit location, intended behavior, and observable result without supplying learner solution snippets or prepared REPL commands. Name a focused change directly when useful, such as replacing `.random()` with `.json(catalog)`, while leaving the learner to implement it. Keep learner solutions out of serialized lesson metadata; proposed tutor changes and already saved learner work remain visible as diffs. Exercise instructions and successful-save feedback must name the next concrete action, including prerequisites such as adding an item before checkout, the actual control label, and the expected result. Give follow-up guidance when a multi-action experiment is only partly complete. Break long explanations into smaller messages with an Okay button to reveal the next part. Reveal at most one new tutor bubble per user action, and pause between the final part of an explanation and the next message as well as between short consecutive messages. Background checks and reloads must not advance this pacing. Preserve revealed messages across reloads; acknowledgment only reveals text and must not apply edits, run scenarios, or credit lesson completion.
- Test-support objects that carry process environments must omit those mappings from diagnostic representations, so assertion failures do not print credentials inherited by child processes.
- The documentation has a feature-based manual and a separate API reference. Keep `site/src/data/navigation.json`, the Markdown manual/reference indexes, and the home-page feature count aligned when adding chapters. Reuse canonical Markdown pages rather than duplicating existing guides, preserve published documentation URLs through the site redirect map when retiring redundant Markdown sources, and check rendered anchors as well as page destinations after restructuring.
- When rebuilding documentation navigation, compare removed content with the previous site as well as checking URLs. Preserve privacy disclosures, project resources, task indexes, and externally configured client examples; verify retained guides have incoming links from the new navigation. A successful link check cannot detect removed information or orphaned pages.
- Documentation is also rendered as site pages. Link repository-only examples
  outside the published docs tree through GitHub source URLs, and validate the
  rendered site with `npm run check-links` instead of relying on filesystem paths.
  For examples introduced by an unmerged PR, use a verified commit-pinned source
  URL; a `main` URL returns 404 until merge. Check external example destinations
  separately because the site link checker skips external URLs.

- Keep maintained examples eligible for Renovate updates; do not exclude `**/examples/**` in `ignorePaths`. Preserve the other dependency, vendor, test, and fixture exclusions when editing that array.
- Validate `examples/first-10-minutes` with its own `npm ci` and `npm run verify`; its npm lockfile is independent of the root Yarn lockfile. Prefer a disposable copy for this check: generation writes routes, types, and caches into the example, and those outputs can cause unrelated root lint failures if left in the worktree.
- Before overriding a transitive native dependency outside its parent's declared range, verify the published package declares its platform bindings and validate a clean install plus the consuming build. Prefer the parent's supported range when an override is no longer needed.
- For security overrides across major versions, scope the override to the affected parent and verify the API and module format it consumes with a real behavior check. Root Yarn resolutions and npm overrides repair only their installation roots; they are not inherited by consumers of published workspace packages.
- Keep weekly Renovate lockfile maintenance enabled for the root, documentation site, and maintained tutorial. Direct dependency updates can preserve vulnerable transitive versions; each independent lockfile needs its own refresh and validation.
- Keep Renovate `gitIgnoredAuthors` aligned with the author used by the Changesets workflow so automated release-metadata commits do not mark dependency PRs as manually edited.
- Renovate security-fix ingestion also requires the installed GitHub app to have read access to Dependabot alerts; repository configuration alone does not establish that permission.
- Use `usingTemporaryFiles()` for filesystem-heavy tests.
- Astro static-build tests must keep temporary output on the checkout filesystem: Astro stages assets under the working directory and renames them into the output, so system temporary directories on a different volume cause `EXDEV`. Continue using `usingTemporaryFiles()` and restore any temporary-directory environment override in `finally`.
- The Astro site uses `compressHTML: true` to preserve HTML whitespace around inline prose across source line breaks. Keep that setting explicit when upgrading Astro, and run `cd site && npm run test:whitespace` for rendering or formatting changes. Check generated text before applying CSS spacing: punctuation and intentional in-word links must remain adjacent.
- Keep single-line command snippets in a focusable horizontal scroll region, with copy controls outside that region. A scrolling flex item needs `min-width: 0` so long text cannot widen the whole page. Emitted CSS/HTML checks establish this contract; they do not replace browser checks of scrolling, keyboard access, or viewport overflow.
- In file-watching tests, register the expected event listener before writing the file, then await the saved promise. Close watchers in test teardown so Jest timeouts cannot skip cleanup; restore any changed working directory there as well.
- For source or tsconfig analysis in repository tooling, use the existing
  TypeScript parser instead of custom tokenizers or JSONC stripping. Preserve
  the source filename so TypeScript and TSX syntax are parsed correctly.
- Package-boundary export checks validate public subpaths across conditions;
  they do not replace installed-consumer tests for runtime resolution. Keep
  regression coverage for null exclusions and overlapping export patterns.
- Keep tests focused by subsystem (`packages/counterfact/test/cli`, `packages/counterfact/test/server`, `packages/counterfact/test/typescript-generator`, `packages/counterfact/test/util`).
- Preserve documented behavior promises (e.g., regen preserves route edits; types are regenerated).
- When terminal output displays an HTTP message, split its head and body at the first `\r\n\r\n` separator only: multipart bodies contain additional separators that must remain visible.
- Documentation pages can be direct entry points. Introduce Counterfact-specific terms before using them, linking to `packages/counterfact/docs/manual/concepts.md` for shared definitions. State example prerequisites before snippets, distinguish generated helpers from authored context methods, and explain group/version/prefix and handler/constructor/scenario argument boundaries consistently. Extend current canonical pages rather than restoring retired guides.
- For user-facing behavior changes: add a changeset and update docs under `packages/counterfact/docs/`.
- When reconciling changes across the documentation reorganization, keep the Manual/API chapter structure and retired-page redirects. Move API contracts and migration guidance into the matching `api/` chapter and practical examples into `manual/`; do not restore deleted reference or pattern pages to preserve an older edit.
- After Changesets versions workspace packages, run `yarn install --mode skip-build --no-immutable` so `yarn.lock` can match the new internal versions before immutable installation; CI enables Yarn immutability by default, so the explicit override is required in `release:version`.
- A push to `main` with no remaining changesets publishes the merged package versions automatically; a manual Release workflow dispatch is the retry and recovery path.
- Keep the `npm-publish` environment name, OIDC permission, and provenance setting aligned with the npm trusted-publisher configuration.
- Use OS-assigned ephemeral ports for tests that start network servers; fixed high ports can collide on shared CI hosts.
- When an OpenAPI-aware request builder gains an input kind or encoding rule,
  keep the route-catalog metadata, immutable builder state, required-input
  diagnostics, help and inspection output, wire serialization, public docs,
  focused unit tests, and ephemeral-port integration tests aligned. Define and
  test precedence whenever two builder methods compete for the same HTTP
  request entity.
- When a status check is required by a merge-queue ruleset, configure its workflow to run on `merge_group` with `checks_requested`; a `pull_request`-only workflow leaves the queue's synthetic commit without that check and eventually times out.
- When a pull-request workflow's decision depends on labels, include `labeled` and `unlabeled` activity types so a label change refreshes the required status rather than leaving a stale result.
- For public repository-history audits, record classification confidence separately from chronology confidence. Use an exact origin only when the introducing change is demonstrated; otherwise publish the earliest confirmed affected bound and label it as a bound.
- Keep audit windows, population rules, candidate dispositions, deduplication rules, immutable source identifiers, and derived totals in a checked-in manifest with an offline consistency check. Do not make a headline denominator depend only on hand-maintained page copy or a live search URL.
- For time-to-report quality cohorts, close intake early enough to give every included release the same fixed follow-up. Publish the complete candidate ledger, treat unresolved response cases as censored, make raw event counts primary when exposure units are heterogeneous, and label rate denominators as sensitivity analyses.

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

For pseudo-terminal teardown, close the master before waiting for child exit so unread output cannot block terminal draining. Bound every wait, including after SIGTERM, and escalate to SIGKILL rather than using an unbounded waitpid. Avoid parent HTTP-server threads before forkpty on macOS; keep HTTP fixtures in separate processes.

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
- Presenting a source-preserving refactor as a defect's origin, or silently omitting standalone external defect pull requests from a report population.

## Embedding learnings into guidance

- When a non-trivial task reveals repeatable guidance, update the relevant skill file in the same PR, or create a new skill if applicable.
- Put subsystem-specific learnings in the matching skill (`counterfact-cli-runtime`, `counterfact-runtime-architecture`, or `counterfact-generator-internals`).
- Put cross-cutting learnings in `AGENTS.md` only when they do not belong to a single subsystem skill.

## How to validate the change

- Baseline: `yarn lint:fix`, `yarn lint`, `yarn build`, `yarn test`.
- Run targeted tests for touched modules before full test run.
- If server startup or CLI behavior changed, run `yarn build` then `yarn test:black-box`.
- For black-box changes, run the boundary searches above and resolve or explicitly reclassify every finding in the touched scope.
