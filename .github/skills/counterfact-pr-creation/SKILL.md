---
name: counterfact-pr-creation
description: Create Counterfact pull requests with the required agent-authored acceptance and repository-learning notes; do not use to review another PR.
---

# Counterfact PR Creation Skill

## When to use this skill

Use this skill when an agent creates or opens a Counterfact pull request.
Do not use it as a review checklist.

## Agent-owned PR sections

`## Manual acceptance tests` and `## Repository learning check` are responsibilities of the agent that creates the PR, not of a reviewing agent.
A reviewing agent must not look for either section or treat its absence as a PR deficiency.
Their absence most likely means the PR was not opened by an agent.

## Manual acceptance tests

Every agent-created PR description must include a section titled exactly `## Manual acceptance tests` with 3–6 unchecked checkboxes.
Each checkbox must describe an observable behavior, not an implementation detail, and must not be pre-checked.

- Cover the main success path, at least one edge case, and one regression check where applicable.
- A PR that only adds files under `.github/issue-proposals/` may omit this section.
- The repository workflow validates this section for applicable PRs; complete the checklist before merge.

## Repository learning check

For every non-trivial agent-created PR, include this section in the PR description:

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
- Cross-cutting conventions that apply throughout the repository → update `AGENTS.md`

A durable learning is a reusable rule, pattern, validation step, compatibility concern, testing strategy, architectural constraint, or repository-specific convention that helps future contributors avoid mistakes or work more effectively.

Do not create guidance for one-off implementation details, temporary workarounds, PR-specific decisions, historical commentary, or task summaries.
If no durable learning was discovered, explicitly record `Learning found: No` and do not create or modify guidance files solely to satisfy this requirement.
