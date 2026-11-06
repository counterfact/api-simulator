# Module generation experiment for #2631

This branch is an experiment, not a release candidate. It tests an alternative
for PR #2636 after source-based import-promise reuse introduced failed-import
and stale-canonical-module regressions.

## Design under test

Each ModuleLoader load attempt creates a new ModuleGeneration. Every ESM entry
gets the same unique generation query parameter. One stateless Node synchronous
resolve hook propagates that parameter to local file imports, including local
package aliases and dynamic imports. Builtins, bare package dependencies, and
CommonJS resolution retain their normal resolution behavior.

No process-wide source-text or rejected-promise cache is maintained. Fresh
loaders and initialization retries get different URLs. Watch updates reload the
registered directory and scenarios as a graph rather than independently
cache-busting entries. Live context state still uses ContextRegistry.update.

Classes imported directly outside a generation have different identity from
classes inside it. This is a deliberate boundary change, not compatibility with
the previous canonical-import guarantee. Existing objects stored in preserved
context state are not automatically migrated to newly evaluated classes.

## Results on Node 26.5.1

- Full workspace build: passed.
- ESLint on the five changed runtime and test paths: 0 errors, 9 warnings.
- Existing native module-loader-cache fixture: passed, with its external-class
  assertion changed to verify the explicit generation boundary. It still checks
  repeated fresh simulators, internal context/error identity, independent
  context instances, changed route/scenario entries, constructor retries, and
  watcher updates.
- New native module-generations fixture: six tests passed. These cover all four
  adversarial cases from the PR review: missing dependency recovery, transient
  evaluation failure recovery, constructor failure recovery after external
  state changes, and stale canonical imports. Additional checks cover same-loader
  retry, local helper refresh with preserved context state, cycles, local package
  aliases, and delayed imports after a second simulator has been created.
- Existing focused Jest suites: 21 tests passed and 12 failed. Jest explicitly
  rejects module.registerHooks because those hooks attach to Node's loader,
  not Jest's sandboxed module loader. Lazy hook registration preserves CommonJS
  paths but does not solve ESM embedding in Jest. These failures are a blocker;
  no test-host exception, swallowed hook error, or mock fallback was added.

## Reproduce

Build before running tests. From the repository root:

```sh
yarn build
CHOKIDAR_USEPOLLING=1 node packages/runtime/test/fixtures/module-loader-cache.mjs
node packages/runtime/test/fixtures/module-generations.mjs
CHOKIDAR_USEPOLLING=1 node --experimental-vm-modules node_modules/jest-cli/bin/jest.js --watchman=false --runInBand --runTestsByPath packages/runtime/test/server/module-identity.test.ts packages/runtime/test/server/module-loader.test.ts packages/runtime/test/server/context-registry.test.ts
```

## Unresolved boundaries

The synchronous Node hook backend is unsuitable as a transparent default while
Counterfact supports direct ESM loading inside Jest. A possible next experiment
is an explicit module-graph host adapter, keeping native graph management
separate from simulator state construction, rather than treating Jest as a
special case or suppressing its rejection.

This experiment has not established compatibility across supported Node
versions, mixed CommonJS/ESM graphs, partial-directory refreshes, other loader
hooks, concurrent requests during graph application, or saved objects from
previous generations. Node retains evaluated ESM generations for the process
lifetime; this approach does not bound hot-reload memory or provide immutable
filesystem snapshots for modules first imported dynamically after a file edit.
The broader product suites were not rerun after the focused compatibility
failure. None of the results establish human manual acceptance.
