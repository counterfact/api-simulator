---
"counterfact": minor
---

Scenarios now support version-scoped directories and version-aware startup initialisation.

- When a runner has a non-empty `version`, scenario files are loaded from `<basePath>/<group>/<version>/scenarios/` first (version-specific), then from `<basePath>/<group>/scenarios/` as a shared fallback. Version-specific files take precedence over shared files with the same key.
- The startup scenario's `$` argument now includes a `version` property containing the runner's version string (or `""` for unversioned runners), enabling per-version initialisation logic:

```ts
export const startup: Scenario = ($) => {
  if ($.version === "v2") {
    $.context.featureFlags = { newPagination: true };
  }
};
```
