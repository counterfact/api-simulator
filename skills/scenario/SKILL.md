---
name: scenario
description: >
  Create and update Counterfact scenario modules that seed or mutate context
  state through reusable scenario functions.
applyTo:
  - "**/scenarios/**/*.{ts,js}"
---

# Scenario Skill

## Purpose

Create scenario files that seed and manipulate runtime data for Counterfact
mocks.

## Where scenario files live

- Put scenario modules in `scenarios/`.
- Keep `scenarios/index.ts` as the primary export surface.
- Use `startup` in `scenarios/index.ts` for automatic boot-time seeding.

## Scenario function API

A scenario is a function receiving `$` and using it to access context and route
helpers.

```ts
import type { Scenario } from "../types/_.context.js";

export const startup: Scenario = ($) => {
  $.context.createThing({ name: "example" });
};
```

Typical `$` usage in scenarios:

- `$.context` for state changes
- `$.route("/path")` for calling routes from scenario setup flows

## Required rules

- Keep reusable business operations in contexts; scenarios orchestrate calls.
- Keep scenarios focused on setup flows and fixtures.
- Do **not** create unit tests in this skill.

## References

- https://counterfact.dev/docs/features/scenarios.html
- https://counterfact.dev/docs/features/state.html
