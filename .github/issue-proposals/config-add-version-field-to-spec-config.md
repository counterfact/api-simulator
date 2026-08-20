---
title: "config: add `version` field to SpecConfig and YAML config"
parentIssue: 1937
labels:
  - enhancement
  - config
assignees: []
milestone:
---

Add an optional `version` field to `SpecConfig` (and the YAML config format) so users can declare multiple versioned specs under the same group. This is the first foundational step for multi-version support.

## Context

The current `SpecConfig` interface has `source`, `prefix`, and `group`. The multi-version feature needs a `version` field so that two specs with the same `group` but different `version` values can coexist. For example:

```yaml
spec:
  - source: ./specs/my-api-v1.yaml
    group: my-api
    version: v1
  - source: ./specs/my-api-v2.yaml
    group: my-api
    version: v2
destination: out
```

Without this field, specifying two specs in the same group is treated as a duplicate-group error (which is correct today, but needs to be relaxed when versions are present).

## Proposed change

1. Add an optional `version: string` field (default `""`) to the `SpecConfig` interface in `packages/counterfact/src/app.ts`.
2. Update `normalizeSpecs` / `normalizeSpecOption` (in `packages/counterfact/src/cli/run.ts`) to pass `version` through from the YAML config or CLI when provided.
3. Relax the duplicate-group validation in `validateSpecGroups` (in `packages/counterfact/src/app.ts`): two specs may share the same `group` as long as they each carry a distinct non-empty `version`. Mixed configurations (same-group entries with and without `version`) should produce a clear validation error.
4. Update the `counterfact.yaml` JSON Schema (if one exists) to allow `version` on each spec entry.
5. Update the TypeScript types for the CLI's `SpecOption` / `SpecEntry` objects to include the optional `version` field.

## Acceptance criteria

- [ ] `SpecConfig` has an optional `version: string` field that defaults to `""`
- [ ] A YAML config with two specs sharing the same `group` but different non-empty `version` values is accepted without error
- [ ] A YAML config with two specs sharing the same `group` and no `version` (or one with and one without) still produces a clear validation error
- [ ] `normalizeSpecOption` passes `version` through for both single-object and array inputs
- [ ] Unit tests cover the new valid and invalid group+version combinations in `validateSpecGroups`
- [ ] Single-spec usage without a `version` field continues to work unchanged
