---
title: "server: route versioned specs to /<group>/<version> URL prefixes"
parentIssue: 1937
labels:
  - enhancement
  - server
assignees: []
milestone:
---

When a spec declares both a `group` and a `version`, the server should automatically mount that spec's routes under `/<group>/<version>`, so two versions of the same API are addressable at distinct URL prefixes without the user manually configuring `prefix`.

## Context

For specs that carry `group` and `version`, the intended URL layout is:

```
https://localhost:3100/<group>/<version>/...
```

For example, a config with `group: my-api, version: v1` and `group: my-api, version: v2` should produce:

```
GET /my-api/v1/pets
GET /my-api/v2/pets
```

Today, an explicit `prefix` is required on every `SpecConfig` entry. The new behavior should derive the prefix automatically from `group + version` when both are present, while preserving backward compatibility for specs that supply an explicit `prefix` or have no version.

## Proposed change

Update `normalizeSpecs` (or the `counterfact()` wiring in `packages/counterfact/src/app.ts`) to apply the following prefix derivation rule for each `SpecConfig` entry:

| `prefix` provided? | `group` set? | `version` set? | Derived prefix                  |
| ------------------ | ------------ | -------------- | ------------------------------- |
| Yes                | any          | any            | use the explicit prefix         |
| No                 | Yes          | Yes            | `/<group>/<version>`            |
| No                 | Yes          | No             | `/<group>`                      |
| No                 | No           | No             | `""` (root, single-spec legacy) |

This keeps backwards compatibility: specs without `version` continue to behave exactly as today.

## Acceptance criteria

- [ ] A spec with `group: "my-api"` and `version: "v1"` is served under `/my-api/v1` when no explicit `prefix` is provided
- [ ] A spec with an explicit `prefix` always uses that prefix, regardless of `group`/`version`
- [ ] Two specs with the same `group` but different `version` values are each reachable at their respective `/<group>/<version>` prefixes on a single server instance
- [ ] Single-spec usage (no `group`, no `version`) continues to work at the root or the supplied `prefix`
- [ ] The Swagger UI dashboard lists each mounted API with its derived prefix
- [ ] Unit and/or black-box tests verify that routes for both versions respond correctly at their expected URLs
