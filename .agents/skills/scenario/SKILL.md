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
mocks. Treat each scenario as a transformation of the developer's current
state.

## Where scenario files live

- Put scenario modules in `scenarios/`.
- Keep `scenarios/index.ts` as the primary export surface.
- Use `startup` in `scenarios/index.ts` for automatic boot-time seeding.

## Scenario function API

A scenario is a function receiving `$` and using it to access context and route
helpers.

```ts
// Path is relative to the scenarios directory at the generated project root.
import type { Scenario } from "../types/index.js";

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
- Make scenarios additive by default. Change only the records, fields, and
  relationships needed for the named condition; preserve unrelated state and
  the effects of earlier compatible scenarios.
- When the simulator needs a deterministic baseline, give full-state
  replacement one clearly named home such as `reset`. Keep its baseline data
  beside that scenario. Individual scenarios must not rebuild the entire world
  or invoke reset implicitly.
- A destructive scenario's name must state its effect, such as `emptyAccount`
  or `removeExtraSubscription`. Document which records it removes or replaces.
- Document prerequisite state and the records changed. If required records are
  absent, fail with a useful instruction to run the baseline or prerequisite
  scenario instead of silently resetting.
- Use focused scenario tests when composition or preservation of existing state
  carries behavior. Use HTTP integration or product journeys to verify the
  resulting responses when that boundary matters.

## Verify composition

Apply the baseline, then two compatible scenarios, and verify both effects
remain along with unrelated records. Test destructive scenarios against the
specific state they contract. Assert domain state or client-visible behavior;
avoid assertions tied only to helper call order.

## References

- https://counterfact.dev/docs/features/scenarios.html
- https://counterfact.dev/docs/features/state.html
