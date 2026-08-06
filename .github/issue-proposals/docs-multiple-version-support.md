---
title: "docs: document multi-version API support"
parentIssue: 1937
labels:
  - documentation
assignees: []
milestone:
---

Add user-facing documentation that explains how to configure and use multi-version API support: YAML config syntax, generated code layout, the `Versioned` type, route-handler authoring patterns, and REPL usage.

## Context

Multi-version support introduces several new concepts that need clear documentation for users:

- How to declare multiple versions of the same API group in the config
- The URL layout produced by the server (`/<group>/<version>/...`)
- The generated code layout (`types/<version>/...`, shared `types/paths/...`, `types/versions.ts`)
- How to write a route handler that serves multiple versions using the `Versioned` type
- How the REPL addresses versioned context, routes, and scenarios

Without documentation, users will not know the feature exists or how to adopt it.

## Proposed change

1. **`packages/counterfact/docs/features/multiple-versions.md`** – New dedicated feature page covering:
   - YAML config syntax with `group` and `version` fields (with a realistic example that is not specific to any particular API)
   - How the server derives URL prefixes from `group` + `version`
   - Generated code layout diagram (shared `types/paths/`, per-version `types/<version>/`, `types/versions.ts`)
   - How to write a route handler using `Versioned<…>` and `minVersion()`
   - How to use `.scenario <group> <version> <path>` in the REPL

2. **`packages/counterfact/docs/usage.md`** or **`packages/counterfact/docs/getting-started.md`** – Add a brief "Multiple versions" section that links to the feature page.

3. **`packages/counterfact/docs/reference.md`** – Document the `version` field on `SpecConfig`, the `Versioned` type, and the `types/versions.ts` output file.

4. **`packages/counterfact/src/counterfact-types/` JSDoc** – Ensure `Versioned`, `Versions`, and `VersionsGTE` have accurate JSDoc comments that appear in IDE tooltips.

## Acceptance criteria

- [ ] `packages/counterfact/docs/features/multiple-versions.md` exists and covers config syntax, URL layout, code layout, handler authoring, and REPL usage
- [ ] The example in the documentation uses a generic API, not a specific real-world API, to avoid implying the feature is limited to a particular use case
- [ ] `packages/counterfact/docs/usage.md` or `packages/counterfact/docs/getting-started.md` links to the new feature page
- [ ] `packages/counterfact/docs/reference.md` documents the `version` field and the `Versioned` type
- [ ] `Versioned`, `Versions`, and `VersionsGTE` have JSDoc comments
- [ ] A code example shows a route handler using `minVersion()` to branch on API version
