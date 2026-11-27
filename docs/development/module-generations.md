# Module generations and native integration tests

`ModuleGeneration` assigns one ESM generation URL to each module-load attempt.
A single stateless Node resolution hook propagates that generation through
local static imports, reexports, package-import aliases and dynamic imports.
Builtins, bare packages and CommonJS resolution retain normal Node behavior.
The hook does not retain a registry of simulator instances.

Fresh simulators, retries, and watcher reloads use new generations. Context
construction remains separate: initial loads and explicit state resets construct
new contexts; hot reload merges declarations while preserving live mutations.
Objects retained from older generations are not automatically migrated. A direct
import outside Counterfact does not promise constructor identity with a simulator.

Run module-loading and application integration tests under `node:test`, against
built workspace output. Node hooks do not apply to Jest's sandboxed module loader.
Keep pure registry, dispatcher, generator and other unit tests under Jest.

- `yarn test` builds and runs native integration tests before Jest.
- `yarn test:native` builds and runs all native integration tests.
- `yarn test:coverage` enforces native coverage and then Jest coverage.
- `yarn workspace @counterfact/runtime test:native:coverage` builds and checks
  only the runtime loader/generation boundary, with a 90% branch floor.

Native application tests preserve their existing standalone `expect` assertions
and `jest-mock` spies, with spy restoration after every test. The runner is
Node's own runner; no Jest module sandbox or special-case hook fallback is used.
Use `usingTemporaryFiles()` in both frameworks. Register expected watcher events
before editing files, and register watcher cleanup before assertions.

Coverage ownership follows execution: Jest measures the pure source boundary;
Node measures the compiled loader/generation and application orchestration files.
The pure context-registry snapshot tests also enforce a 90% branch floor in Jest.
Native and Jest reports both enforce at least 90% branch coverage. Native reports are separate from the
Jest report uploaded to Coveralls. Do not lower either threshold to migrate tests.
CI exercises native runtime tests on Node 22.22/Linux and Node 24/Windows in
addition to the complete Node 24/Linux integration and unit coverage check.

Node keeps evaluated ESM generations cached for the process lifetime. Refreshing
the graph does not bound reload memory, provide a filesystem snapshot for future
dynamic imports, or migrate saved objects across class generations. A reload
refreshes the graph as a unit; runtime state lives in contexts and stores, rather
than module-level mutable variables that are reevaluated during a code refresh.
