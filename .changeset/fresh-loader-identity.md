---
"@counterfact/runtime": minor
"counterfact": patch
---

Load routes, contexts, scenarios, and local ESM dependencies in coherent module generations. Fresh loaders and initialization retries recover from failed imports without reusing stale canonical modules, while reloads preserve live context state.

Coordinate generation refreshes across versioned runners sharing a context registry, preserving handler and custom-error identity across every version. Keep extensionless dotted helper imports and symlinked helper directories working in the compiled fallback.

Preserve unchanged nested class-backed context state across unrelated route refreshes, including cyclic collections and class-owned arrow methods, while detecting changed enumerable initializer data and class declarations.

Constructors imported outside a simulator can differ from constructors inside its generation. Run module-loading integration tests under native Node rather than Jest's module sandbox.

Preserve Map/Set declaration snapshots during graph refresh and include explicit CommonJS routes and middleware in the compiled fallback cache.

Clone existing regular expressions without recompiling their source properties, while preserving declaration cursors and live state across unchanged reloads.

Retry transient Windows sharing violations when publishing compiled cache files, including concurrent startup of versions in one API group, without exposing partial or missing output.
