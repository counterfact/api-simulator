---
"@counterfact/runtime": minor
"counterfact": patch
---

Load routes, contexts, scenarios, and local ESM dependencies in coherent module generations. Fresh loaders and initialization retries recover from failed imports without reusing stale canonical modules, while reloads preserve live context state.

Constructors imported outside a simulator can differ from constructors inside its generation. Run module-loading integration tests under native Node rather than Jest's module sandbox.

Preserve Map/Set declaration snapshots during graph refresh and include explicit CommonJS routes and middleware in the compiled fallback cache.

Clone existing regular expressions without recompiling their source properties, while preserving declaration cursors and live state across unchanged reloads.
