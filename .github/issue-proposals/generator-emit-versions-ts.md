---
title: "generator: emit versions.ts with Versions, VersionsGTE, and Versioned types"
parentIssue: 1937
labels:
  - enhancement
  - typescript-generator
assignees: []
milestone:
---

When multi-version specs are configured, the code generator should emit a `types/versions.ts` file containing the `Versions` union, the `VersionsGTE` map, and the `Versioned` utility type that route handlers use to narrow their `$` argument to a specific API version.

## Context

The `Versioned` type allows a single route-handler function to serve multiple API versions while the TypeScript type system enforces that each version's parameters and responses are used correctly. It is the public contract between the generated types and the user-authored route handlers.

The file should be generated (not hand-written) because the `Versions` union and `VersionsGTE` map must be derived from the `version` strings declared in the user's spec config.

## Proposed shape

```ts
// types/versions.ts  (generated, do not edit)

export type Versions = "v1" | "v2";

/**
 * Maps each version to the set of versions that are greater than or equal to it.
 * Used by `Versioned.minVersion()` to narrow which versions a handler must support.
 */
export type VersionsGTE = {
  v1: "v1" | "v2";
  v2: "v2";
};

type VersionMap = Partial<Record<Versions, object>>;

export type Versioned<
  T extends VersionMap,
  V extends keyof T & Versions = keyof T & Versions,
> = T[V] & {
  version: V;
  minVersion<M extends keyof T & Versions>(
    min: M,
  ): this is Versioned<T, Extract<V, VersionsGTE[M]>>;
};
```

The version ordering used to build `VersionsGTE` should follow the order in which versions appear in the spec config (first entry = oldest). The `Versioned` type body itself is a fixed template; only `Versions` and `VersionsGTE` vary per configuration.

## Proposed change

1. Add a new code-generation step (or extend the repository's post-processing phase) that reads all unique non-empty `version` strings from the spec configs in declaration order.
2. Emit `types/versions.ts` with the `Versions` union, the `VersionsGTE` map, and the fixed `Versioned` utility type.
3. When no spec carries a `version` field, skip emitting `types/versions.ts` entirely to avoid changing single-spec output.
4. Export `Versioned` from `packages/counterfact/src/counterfact-types/index.ts` so route-handler authors can import it directly alongside other shared types.

## Acceptance criteria

- [ ] `types/versions.ts` is generated when at least one spec has a non-empty `version`
- [ ] `Versions` is a union of all distinct version strings in config-declaration order
- [ ] `VersionsGTE[V]` includes `V` and all later-declared versions (i.e. versions >= V)
- [ ] The `Versioned` utility type compiles without errors and correctly narrows `$` in a test route handler
- [ ] `Versioned` is exported from `packages/counterfact/src/counterfact-types/index.ts`
- [ ] No `types/versions.ts` is emitted for single-spec (no version) configurations
- [ ] Unit tests cover `Versions` and `VersionsGTE` generation for 1-, 2-, and 3-version configs
