---
"@counterfact/runtime": minor
"counterfact": patch
---

Load routes, contexts, scenarios, and local ESM dependencies in coherent module generations. Fresh loaders and initialization retries recover from failed imports without reusing stale canonical modules, while reloads preserve live context state.

Coordinate generation refreshes across versioned runners sharing a context registry, preserving handler and custom-error identity across every version. Keep extensionless dotted helper imports and symlinked helper directories working in the compiled fallback.

Preserve plain-data and native-container context snapshots across reloads. Treat nested user class instances as identity-sensitive: reconstructed class-backed fields replace old instances rather than attempting to migrate their state. Unchanged context graphs retain their existing instances.

Constructors imported outside a simulator can differ from constructors inside its generation. Run module-loading integration tests under native Node rather than Jest's module sandbox.

Preserve Map/Set declaration snapshots during graph refresh and include explicit CommonJS routes and middleware in the compiled fallback cache.

Clone existing regular expressions without recompiling their source properties, while preserving declaration cursors and live state across unchanged reloads.

Retry transient Windows sharing violations when publishing compiled cache files, including concurrent startup of versions in one API group, without exposing partial or missing output.

Reuse unchanged local ESM dependency graphs during watcher refreshes so unrelated route edits preserve root context arrow receivers and private-field state. Continue invalidating changed modules and their importers, and keep explicit loads/retries fresh.

Dynamic-import detection uses syntax parsing instead of a backtracking regular expression, so comment-heavy source cannot stall graph loading.

Keep successful context graphs alive while unrelated route syntax or evaluation failures are corrected. Track failed module evaluations separately, retry unconfirmed dependency graphs, and scope constructor failures to their own module. CommonJS watcher refresh supports one loader per source graph; independent simulators sharing CommonJS files use Node’s shared cache, not per-simulator cache isolation.
