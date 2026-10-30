---
name: counterfact-maintenance
description: >
  Keep contributor changes aligned with repository test patterns, diagnostics,
  black-box test boundaries, release/versioning workflow, documentation
  requirements, and compatibility.
applyTo:
  - "packages/*/src/**/*.ts"
  - "packages/*/test/**"
  - "packages/counterfact/docs/**/*.md"
  - "test-black-box/**/*.py"
  - "test-black-box/**/*.feature"
  - ".agents/skills/**"
  - "AGENTS.md"
  - "docs/**/*.md"
  - "site/**"
  - ".changeset/*.md"
  - ".github/workflows/**/*.yaml"
  - ".github/workflows/**/*.yml"
---

# Counterfact Maintenance Skill

Use this skill when changing tests, diagnostics, documentation, packaging,
dependencies, releases, or contributor workflows. Start with `AGENTS.md`,
`package.json`, and the affected workspace's implementation and `test/` directory.

## Shared obligations

- Preserve documented defaults, response semantics, hot reload, and regeneration
  guarantees: route edits survive regeneration; generated types are replaced.
- For user-facing behavior changes, update canonical documentation under
  `packages/counterfact/docs/` and add a changeset.
- Follow `AGENTS.md` for temporary-file helpers and isolated worktrees.
- When a non-trivial task reveals a reusable lesson, update the owning skill in
  the same change. Keep cross-cutting conventions in `AGENTS.md`; keep one-off
  workarounds and task histories out of standing guidance. Use
  [PR creation](../counterfact-pr-creation/SKILL.md) when opening a PR.

## Read the reference for the change

Read only the references needed for the current task. Paths inside them are
relative to the repository root.

| Change                                                            | Reference                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| Documentation, navigation, Astro rendering, or drift mappings     | [Documentation and site](references/documentation-site.md)   |
| Build scripts, published artifacts, releases, or CI workflows     | [Build and release](references/build-release.md)             |
| Renovate, security overrides, lockfiles, or maintained examples   | [Dependencies](references/dependencies.md)                   |
| Unit/integration/type tests, watchers, or source-analysis tooling | [Focused testing](references/testing.md)                     |
| Gherkin journeys or shipped CLI/HTTP/terminal behavior            | [Product black-box testing](references/black-box-testing.md) |
| Historical experiment evidence or public research reports         | [Historical audits](references/historical-audits.md)         |

For lesson progression, saved-handler checks, or tutorial UI behavior, use
[tutorial guidance](../counterfact-tutorials/SKILL.md).

## Validate according to the change

- Guidance/prose only: check diffs, local links and paths, and skill metadata
  where applicable. Execute changed copyable recipes against their stated
  contract/version. Product suites are needed when a product contract changes.
- Source or behavior changes: run focused tests first, then `yarn lint`,
  `yarn build`, and `yarn test`. Apply formatting or lint fixes to task-owned
  paths; inspect their diff before broadening the change.
- Server startup or CLI behavior: also run `yarn test:black-box`; use the
  black-box reference when adding or changing journeys.
- Published file/dependency/export changes: run the affected packed-consumer or
  package-closure checks. Finish builds and packing before suites that consume
  workspace `dist`; see the build reference for the shared-output constraint.
- Site rendering/navigation changes: run the relevant emitted-output, link,
  whitespace, and browser checks described in the documentation reference.

Report which boundary each check establishes and any remaining uncertainty.
Agent-run verification and human manual acceptance remain separate.
