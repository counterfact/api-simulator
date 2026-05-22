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

## Repository learning check

For every non-trivial PR, include this section in the PR description:

```markdown
## Repository learning check

- Learning found: Yes/No
- Guidance updated: Yes/No
- Updated file(s): N/A or list files
- Rationale: one sentence explaining why the repository guidance did or did not need to change
```

If `Learning found: Yes`, update the most relevant repository guidance in the same PR.

Use the following decision tree:

- Runtime behavior, REPL behavior, request handling, context usage, server lifecycle, or application architecture → update the appropriate `SKILL.md`
- Generator behavior, code generation patterns, route generation, OpenAPI processing, overlays, or specification handling → update the appropriate `SKILL.md`
- Build, test, release, CI/CD, dependency management, repository maintenance, or contributor workflow → update the appropriate `SKILL.md`
- Cross-cutting conventions that apply throughout the repository → update this file

A durable learning is a reusable rule, pattern, validation step, compatibility concern, testing strategy, architectural constraint, or repository-specific convention that would help future contributors avoid mistakes or work more effectively.

Do not create guidance for:

- One-off implementation details
- Temporary workarounds
- Decisions that only apply to the current PR
- Historical commentary
- Task summaries

If no durable learning was discovered, explicitly record `Learning found: No` and do not create or modify guidance files solely to satisfy this requirement.

## File system operations in tests

When tests need to read or write files, use `usingTemporaryFiles()` from `using-temporary-files`. Do not import `node:fs`, `fs`, `node:fs/promises`, or `fs/promises` directly in test files.

Use the helper methods:

- `$.add(relativePath, contents)`
- `$.addDirectory(relativePath)`
- `$.read(relativePath)`
- `$.remove(relativePath)`
- `$.path(relativePath)`

## New issue proposals

Do not create GitHub issues directly. Propose issues via Markdown files under `.github/issue-proposals/` following:

- `.github/instructions/issue-proposals.instructions.md`
