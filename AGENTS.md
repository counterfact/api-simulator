# Agent Instructions for Counterfact

This is the canonical repository guidance for all coding agents.

## Skill-first workflow

Before making changes, load the most relevant skill and follow it as the primary source of detailed guidance:

- `.agents/skills/counterfact-cli-runtime/SKILL.md`
- `.agents/skills/counterfact-runtime-architecture/SKILL.md`
- `.agents/skills/counterfact-generator-internals/SKILL.md`
- `.agents/skills/counterfact-maintenance/SKILL.md`
- `.agents/skills/counterfact-pr-creation/SKILL.md`
- `.agents/skills/counterfact-repo-basics/SKILL.md`

All repository skills live under `.agents/skills/<name>/SKILL.md`, with any
supporting resources alongside their skill. Keep one canonical copy of each
skill; do not add copies under `.github/skills` or a top-level `skills` directory.
Copilot supports `.agents/skills` directly (see its
[skill discovery documentation](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)).

For work on generated API simulations, load the relevant product skill:

- `.agents/skills/counterfact/SKILL.md`
- `.agents/skills/build-simulation/SKILL.md`
- `.agents/skills/context/SKILL.md`
- `.agents/skills/route/SKILL.md`
- `.agents/skills/scenario/SKILL.md`
- `.agents/skills/counterfact-repl/SKILL.md`

Keep this file focused on cross-cutting rules that are not already covered by those skills.

## Optional Jev development judgments

For bounded classification or evidence checks that would help development, load
`.agents/skills/typesafe-development/SKILL.md`. Patrick has authorized routine
TypeSafe/Jev development use with public Counterfact repository code and
synthetic examples; do not ask again within that scope. Use provider-side budget
controls. Keep credentials, ignored/local private files, personal data, and
unrelated content out of requests. Ordinary builds, tests, and Counterfact
runtime stay offline with respect to TypeSafe.

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
