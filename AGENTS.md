# Agent Instructions for Counterfact

This is the canonical repository guidance for all coding agents.

## Skill-first workflow

Before making changes, load the most relevant skill and follow it as the primary source of detailed guidance:

- `.github/skills/counterfact-cli-runtime/SKILL.md`
- `.github/skills/counterfact-runtime-architecture/SKILL.md`
- `.github/skills/counterfact-generator-internals/SKILL.md`
- `.github/skills/counterfact-maintenance/SKILL.md`
- `.github/skills/counterfact-pr-creation/SKILL.md`
- `.github/skills/counterfact-repo-basics/SKILL.md`

Keep this file focused on cross-cutting rules that are not already covered by those skills.

## Isolated change workspaces

When implementing a new set of changes, create and use a dedicated branch in a separate Git worktree. Keep the original checkout available for integration work rather than making the changes there.

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
