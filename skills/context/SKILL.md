---
name: context
description: >
  Add and evolve Counterfact context classes in _.context.ts files, including
  required unit test coverage for context behavior.
applyTo:
  - "**/_.context.{ts,js}"
  - "**/routes/**/_.context.ts"
  - "**/*context.{ts,js}"
  - "test/**/*.test.ts"
---

# Context Skill

## Purpose

Define and maintain stateful business logic in `_.context.ts` files.

## What `_.context.ts` is for

A `_.context.ts` file owns state and business rules for a route subtree.
Handlers call methods on `$.context`; they should not implement core logic
inline.

## Context class API expectations

- Expose methods for domain actions (create/read/update/delete/query).
- Keep state private where possible.
- Return plain values that route handlers can map to HTTP responses.
- Use clear method names that describe behavior (not transport concerns).

## Required rules

- Any new or modified context method must include unit tests.
- Test the Context class directly (no server boot required).
- Do not populate dummy data directly in context changes.
- Delegate dummy data creation/seeding to scenario modules under `scenarios/`.

## Step-by-step

1. Update or add methods in `routes/**/_.context.ts`.
2. Keep route files calling these methods via `$.context`.
3. Add/adjust unit tests for the changed context methods.
4. If sample data is needed, add/update a scenario function instead of hardcoding
    defaults in context constructors.

## References

- https://counterfact.dev/docs/features/state.html
