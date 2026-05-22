# Copilot Instructions for Counterfact

## Skill-first workflow

Before making changes, load the most relevant skill and follow it as the primary source of detailed guidance:

- `.github/skills/counterfact-cli-runtime/SKILL.md`
- `.github/skills/counterfact-runtime-architecture/SKILL.md`
- `.github/skills/counterfact-generator-internals/SKILL.md`
- `.github/skills/counterfact-maintenance/SKILL.md`
- `.github/skills/counterfact-repo-basics/SKILL.md`

Keep this file focused on cross-cutting rules that are not already covered by those skills.

## Manual acceptance tests

Every PR description must include a section titled exactly `## Manual acceptance tests` with 3–6 unchecked checkboxes. Each checkbox must describe an observable behavior (not an implementation detail), and must not be pre-checked.

- Cover the main success path, at least one edge case, and one regression check where applicable.
- Exception: if a PR only adds files under `.github/issue-proposals/`, this section may be omitted.

## File system operations in tests

When tests need to read or write files, use `usingTemporaryFiles()` from `using-temporary-files`. Do not import `node:fs`, `fs`, `node:fs/promises`, or `fs/promises` directly in test files.

Use the helper methods:
- `$.add(relativePath, contents)`
- `$.addDirectory(relativePath)`
- `$.read(relativePath)`
- `$.remove(relativePath)`
- `$.path(relativePath)`

## Embedded learning loop (replaces decision-log boilerplate)

For non-trivial tasks, embed durable learnings directly into repository guidance instead of writing a one-off PR "Decision and learning log":

- If the learning is about runtime, generator, CLI, or maintenance workflow, update the relevant `SKILL.md` file in the same PR.
- If the learning is a cross-cutting rule that does not fit a single skill, update this file.
- Keep guidance concise and tied to observable outcomes (tests, validation commands, compatibility guarantees).

## New issue proposals

Do not create GitHub issues directly. Propose issues via Markdown files under `.github/issue-proposals/` following:

- `.github/instructions/issue-proposals.instructions.md`
