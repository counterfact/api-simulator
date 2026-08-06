---
name: counterfact-maintenance
description: >
  Keep contributor changes aligned with repository test patterns, diagnostics,
  release/versioning workflow, documentation requirements, and compatibility.
applyTo:
  - "packages/counterfact/src/**/*.ts"
  - "packages/counterfact/test/**/*.ts"
  - "packages/counterfact/docs/**/*.md"
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

## Common mistakes to avoid

- Introducing direct fs imports in tests instead of `usingTemporaryFiles` helper.
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
- Ensure PR notes include manual acceptance tests with observable outcomes.
