# ADR xxx: Convert Counterfact to a Package-Oriented Monorepo

## Status

Accepted

## Context

Counterfact is published as one `counterfact` package. Its source already has
recognizable subsystems for OpenAPI handling, code generation, the HTTP runtime,
the request builder, the REPL, migrations, and the CLI, but those subsystems are
compiled and released as one unit.

That shape makes the complete simulator convenient to install, but it prevents
other tools from consuming a focused capability without also taking on the
entire application. In particular, the following roadmap opportunities need
stable package boundaries before their public APIs can be designed well:

- generating production TypeScript clients;
- consuming types or clients produced by another generator;
- using the OpenAPI overlay engine independently;
- using the TypeScript generator without starting a server; and
- embedding the request builder without launching the Counterfact REPL.

The source folders are a useful starting point, but they are not independent
packages today. Several imports reveal the boundaries that need to be repaired:

- the generator imports watcher configuration from `server/`;
- the runtime imports streaming-media knowledge from the generator;
- runtime and REPL modules import telemetry directly from `cli/`;
- OpenAPI loading and overlay application are coordinated in generator,
  runtime, and web-server modules; and
- `app.ts` and `api-runner.ts` construct concrete classes from every subsystem.

The repository currently uses Yarn 1, one root TypeScript build, Jest and TSD
tests, Python black-box tests, and Changesets for publishing. The migration must
preserve the current `counterfact` package while those tools learn about more
than one package.

### Compatibility constraints

Throughout the migration:

- `npx counterfact` and the `counterfact` binary keep working;
- `import { counterfact } from "counterfact"` and the other existing root
  exports keep working;
- existing CLI flags, configuration files, generated directory layout, and
  hot-reload behavior do not change merely because code moved;
- the installed `counterfact` package remains self-contained from a user's
  perspective;
- generated simulations do not acquire a new runtime dependency without a
  separate decision; and
- every intermediate pull request leaves `main` buildable, testable, and
  releasable.

## Decision

Convert the repository to a Yarn workspace monorepo and split Counterfact into
packages with one-way dependencies. Preserve `counterfact` as the compatibility
facade that composes the focused packages and owns the existing CLI and library
entry point.

The extraction is incremental. New scoped packages begin as private workspace
packages. A package becomes public only after the existing `counterfact` facade
uses it through its declared exports, its consumer contract is documented, and
an installed-tarball smoke test verifies it outside the repository.

### Target repository layout

```text
/
├── package.json                 # private workspace root; orchestration only
├── tsconfig.json                # project references
├── .changeset/
├── docs/                        # repository-level ADRs and development records
├── packages/
│   ├── counterfact/             # published `counterfact` facade and CLI
│   ├── types/                   # @counterfact/types
│   ├── openapi/                 # @counterfact/openapi
│   ├── generator/               # @counterfact/generator
│   ├── runtime/                 # @counterfact/runtime
│   ├── client/                  # @counterfact/client
│   └── repl/                    # @counterfact/repl
├── examples/
├── site/
└── test-black-box/
```

User documentation that ships in the npm package moves with
`packages/counterfact`; repository-only material such as ADRs, development
notes, persona studies, and bug reports stays in the root `docs/` directory.
Links and the website build must continue to treat the package documentation as
the canonical user documentation.

### Package responsibilities

#### `@counterfact/types`

A dependency-light leaf package containing the public TypeScript contracts used
by generated handlers, the generator, and the runtime. It must not import from
another Counterfact package.

Initially, Counterfact continues copying the compatible `counterfact-types`
directory into generated simulations. Changing generated imports to reference
`@counterfact/types` is a separate migration because it would add an installed
dependency to generated projects.

#### `@counterfact/openapi`

OpenAPI document loading, overlay application, document normalization, and the
minimal query model shared by generation and runtime behavior. The core package
does not send telemetry or own a long-running application lifecycle. File
watching remains in the consuming package or is supplied through an adapter.

#### `@counterfact/generator`

TypeScript route and type generation, repositories, scripts, coders, scenario
type generation, pruning, and generator-specific watching. It depends only on
`@counterfact/types` and `@counterfact/openapi` among Counterfact packages. It
must not import from `@counterfact/runtime`, `@counterfact/repl`, or the CLI.

#### `@counterfact/runtime`

Route and context registries, dispatch, request and response validation,
response construction, module loading, transpilation, proxying, store loading,
and the Koa HTTP layer. It may depend on `@counterfact/types` and
`@counterfact/openapi`, but not on the generator, client, REPL, or CLI.

The current runtime dependency on the generator's streaming-content constant
moves to the lowest package that owns that shared contract. Generator watcher
configuration likewise stops coming from the runtime.

#### `@counterfact/client`

The raw HTTP client and OpenAPI-aware immutable request builder currently used
by the REPL and scenarios. It accepts a narrow route-catalog interface instead
of importing the runtime dispatcher. This package becomes the natural home for
future generated-client work, but generating an SDK is outside this migration.

#### `@counterfact/repl`

Node REPL integration, completion, grouped API bindings, and scenario commands.
It depends on `@counterfact/client` and narrow public runtime contracts. Events
such as command usage are reported through an injected callback; this package
does not import CLI telemetry.

#### `counterfact`

The existing package name remains the user-facing facade. It owns the binary,
CLI argument and configuration handling, migrations, telemetry policy, top-level
application orchestration, the current programmatic API, and compatibility
re-exports. It may depend on every focused package.

`api-runner.ts` and `app.ts` stay here until the lower-level packages expose the
small contracts needed to simplify them. They are composition code, not a
reason to create a generic `core` package.

### Allowed dependency direction

| Package                  | Counterfact packages it may depend on     |
| ------------------------ | ----------------------------------------- |
| `@counterfact/types`     | none                                      |
| `@counterfact/openapi`   | `types`                                   |
| `@counterfact/generator` | `types`, `openapi`                        |
| `@counterfact/runtime`   | `types`, `openapi`                        |
| `@counterfact/client`    | `openapi`                                 |
| `@counterfact/repl`      | `client`, narrow contracts from `runtime` |
| `counterfact`            | all focused packages                      |

The important rules are that leaf packages do not import orchestration
concerns, runtime does not depend on generator, and no package depends on the
facade.

Workspace imports use package names and declared `exports`; cross-package deep
imports into another package's `src/` directory are prohibited. CI enforces the
direction with lint restrictions or an equivalent dependency-boundary check.

### Workspace and build policy

- Keep Yarn 1 during the migration. Changing package managers is unrelated and
  would make structural failures harder to diagnose.
- Make the root package private and declare `packages/*` as workspaces.
- Move the currently published package into `packages/counterfact` before
  extracting subsystems.
- Give each package its own `package.json`, `tsconfig.json`, `src/`, tests, and
  explicit `exports` map.
- Use TypeScript project references for deterministic build order and
  incremental type checking.
- Keep lint, unit, TSD, and black-box entry points at the root so contributors
  retain one set of standard commands.
- Test package behavior through public package imports once a subsystem has
  moved. Tests may use package-private paths only when they are colocated inside
  that package.
- Keep the website and examples outside the publishable package set unless a
  concrete workspace dependency makes including them useful.

### Versioning and publishing policy

- `counterfact` keeps its existing 2.x version history.
- New scoped packages begin at `0.1.0` while their direct-consumer APIs settle.
- Packages are versioned independently through Changesets.
- The facade pins compatible internal package versions and receives a changeset
  whenever a dependency update changes its packaged behavior.
- Scoped packages remain `private: true` until their public exports,
  documentation, license metadata, provenance, and tarball smoke tests are
  complete.
- Publishing a focused package does not require immediately documenting every
  internal class as public. Each package exposes the smallest useful consumer
  surface and hides the rest with its `exports` map.

## Implementation Plan

Each phase is a separate pull request unless a phase proves too small to review
independently. Extraction pull requests move one responsibility at a time and
include their own Changeset when user-visible packaging changes.

### Progress and findings

- **Phase 0 completed 2026-08-06.** The compatibility baseline now exercises a
  real pack lifecycle and installs the resulting tarball in a temporary
  consumer. It verifies the root-only export, installed command shim, CLI help,
  programmatic startup, generated output, Windows-safe paths, and downstream
  TypeScript compilation on Linux and Windows CI.
- The baseline audit found that the published manifest referenced
  `dist/server/types.d.ts`, but the build emitted no package-root declarations.
  Declaration emission is now enabled and the public type entry points resolve
  to `dist/app.d.ts`. This repair is part of the baseline rather than a behavior
  change introduced by the monorepo move.
- Compatibility fixtures record the stable manifest fields and package-owned
  documentation exactly. Compiled and binary implementation paths are excluded
  from the exact file-list fixture; working root imports, types, and the
  installed command prove those contracts without preventing later internal
  moves.
- CI now relies on a frozen clean install instead of restoring `node_modules`,
  type-checks both supported operating systems, and runs the packed-consumer
  test on both. The build uses the cross-platform `rimraf` command so the pack
  lifecycle is portable.
- **Phase 1 completed 2026-08-06.** The repository root is now a private Yarn
  workspace, and the existing source, binary, tests, manifest, and npm-owned
  documentation live together in `packages/counterfact`. No subsystem was
  extracted, and `counterfact` remains the only public package.
- Root commands delegate to the workspace while repository-wide Jest, TSD,
  black-box, lint, and release orchestration remain at the root. Changesets
  discovers the moved `counterfact` manifest and the existing patch release.
- TSD remains a root invocation pointed at package-owned declarations and
  tests. Invoking TSD from the composite child project conflicts with the
  temporary program it constructs, so future package extractions should
  colocate type tests with their owner without assuming the runner must also
  execute from that workspace.
- User documentation in `packages/counterfact/docs` is now canonical for both
  the npm package and the Astro site. The root README is a repository map, and
  the installed-tarball fixture confirms that the moved package retains its
  documentation, binary, exports, generated output, and downstream types.
- Moving build output below `packages/` exposed that the flat ESLint ignore was
  not global. The ignore-only configuration now excludes nested `dist`, `out`,
  coverage, reports, and dependency trees without relaxing source linting.

### Phase 0: Freeze compatibility evidence

Before moving files:

1. Record the current `counterfact` tarball contents, manifest fields, binary,
   root exports, and generated Petstore-style output as compatibility fixtures.
2. Add a temporary-consumer smoke test that installs `npm pack` output, imports
   the programmatic API, runs the binary, generates a small simulation, and
   type-checks one generated handler.
3. Ensure Linux and Windows CI run the existing unit, black-box, and type tests
   from a clean install.
4. Document the currently supported public exports so internal classes are not
   accidentally promoted to public API during extraction.

**Exit criterion:** the repository can detect a broken package, binary, public
import, or generated-code contract before the first move.

### Phase 1: Establish the monorepo without splitting behavior

1. Create the private workspace root and `packages/counterfact`.
2. Move the existing package source, binary, manifest, and package-owned user
   documentation together, preserving Git history.
3. Add package TypeScript configuration and root project references.
4. Update root scripts, Jest/TSD paths, black-box fixtures, website links, CI
   caches, and Changesets discovery.
5. Compare the new `counterfact` tarball and smoke-test results with Phase 0.

No subsystem is extracted in this phase.

**Exit criterion:** `counterfact` is still the only public package and behaves
the same when installed, but it is now one workspace in a functioning monorepo.

### Phase 2: Extract the shared type contracts

1. Move `counterfact-types` into `@counterfact/types`.
2. Replace internal relative imports with the workspace package export.
3. Keep the generated `counterfact-types` copy and its import paths unchanged.
4. Colocate TSD tests with the package, invoke them through the root runner
   while composite-project constraints require it, and retain an integration
   test proving the generator's copied types remain compatible.
5. Remove any runtime dependency from the types package.

**Exit criterion:** generator and runtime consume one leaf types package while
generated projects remain source-compatible.

### Phase 3: Extract OpenAPI handling

1. Consolidate overlay application, loading, and shared document contracts in
   `@counterfact/openapi`.
2. Separate pure document work from watching and telemetry side effects.
3. Adapt generator and runtime callers to the same public OpenAPI contract.
4. Add consumer tests for local and remote documents, references, ordered
   overlays, and malformed input.

**Exit criterion:** both generation and runtime use the same consumable OpenAPI
package, and the package can load and overlay a document without starting
Counterfact.

### Phase 4: Extract the generator

1. Move TypeScript generator and scenario-file generator modules into
   `@counterfact/generator`.
2. Move or inject watcher options so the package no longer imports `server/`.
3. Define public generation inputs and results without exposing repository
   internals unnecessarily.
4. Run existing snapshots and black-box generation tests through the package
   export.
5. Verify generated paths, formatting, pruning, multi-spec, and multi-version
   output are byte-for-byte compatible except for intentional import changes
   covered by a separate decision.

**Exit criterion:** a temporary consumer can generate Counterfact route and type
files by installing only the generator and its declared dependencies.

### Phase 5: Extract the runtime

1. Move server, dispatcher, registry, loader, transpiler, proxy, and Koa modules
   into `@counterfact/runtime`.
2. Move shared streaming-media knowledge out of the generator-to-runtime edge.
3. Replace direct telemetry calls with injected event reporting owned by the
   facade.
4. Define narrow runtime interfaces needed by the facade, client, and REPL.
5. Preserve hot reload, store identity, multiple API groups, native TypeScript
   mode, validation, and proxy behavior through integration tests.

**Exit criterion:** the facade starts the same simulator through runtime package
exports, and runtime has no dependency on generator, client, REPL, or CLI.

### Phase 6: Extract the client and REPL

1. Move `RawHttpClient` and `RouteBuilder` into `@counterfact/client`.
2. Replace the request builder's dispatcher type import with a minimal
   OpenAPI/route-catalog contract.
3. Add a direct-consumer example that builds and sends a reusable request
   without starting a REPL.
4. Move Node REPL integration into `@counterfact/repl`.
5. Inject telemetry/event reporting and runtime bindings into the REPL.
6. Verify completion, grouped APIs, scenarios, startup routes, and formatted
   request output through public exports.

**Exit criterion:** client and REPL can be installed and used independently,
and `counterfact` composes them without a compatibility change.

### Phase 7: Harden the facade and publish focused packages

1. Reduce `packages/counterfact` to CLI policy, migrations, top-level
   orchestration, compatibility exports, and packaging.
2. Add dependency-boundary checks and reject package cycles in CI.
3. Run `npm pack` and isolated install tests for every publishable package.
4. Verify Changesets opens and publishes a multi-package release correctly with
   npm provenance.
5. Publish scoped packages individually after their consumer documentation and
   examples are reviewed.
6. Announce focused packages as additive APIs; keep the facade the recommended
   installation for users who want the full simulator.

**Exit criterion:** every public package has a tested, documented consumer use
case, while existing users can continue installing only `counterfact`.

## Acceptance Criteria

The migration is complete when:

- the workspace layout and dependency direction match this ADR;
- no focused package imports from `counterfact` or another package's private
  source;
- runtime and generator are independent siblings;
- the request builder works without the REPL;
- OpenAPI overlays can be consumed without the full simulator;
- the installed `counterfact` binary, root imports, CLI/config behavior,
  generated layout, and npm documentation remain compatible;
- Linux and Windows unit, type, pack/install, and black-box tests pass;
- Changesets can version and publish the facade and scoped packages safely; and
- at least one repository example consumes each published package through its
  declared public exports.

## Options

### Option A: Keep one package and add subpath exports

Expose paths such as `counterfact/generator` without changing the repository or
release shape.

- **Pro:** Least structural work and one version to release.
- **Con:** Every consumer still installs all dependencies, internal coupling
  remains hidden, and any subsystem change releases the whole application.

### Option B: Create packages but retain cross-package deep imports

Move directories into workspaces while allowing packages to reach into one
another's source during the transition.

- **Pro:** Fast initial file movement.
- **Con:** Produces packages that only work inside the repository and postpones
  the dependency design that makes them genuinely consumable.

### Option C: Package-oriented monorepo with incremental extraction (chosen)

Create explicit workspaces, repair dependencies from the leaves upward, and
keep the existing package as a facade.

- **Pro:** Preserves the easy full-product installation while enabling focused
  reuse, independent tests, and future client-generation work.
- **Con:** Requires build, test, documentation, and release changes before the
  feature roadmap resumes.

### Option D: Rewrite around new packages in one change

Design the target APIs and move all subsystems simultaneously.

- **Pro:** Reaches the target tree quickly if every boundary is correct.
- **Con:** Makes behavior regressions, packaging failures, and architectural
  mistakes difficult to isolate or reverse.

## Consequences

### Benefits

- Consumers can install OpenAPI, generator, runtime, client, or REPL behavior
  without adopting the complete CLI application.
- Explicit package APIs expose and prevent architectural cycles.
- Client generation and external-type adapters gain a stable place in the
  ecosystem.
- Package-level tests and versions make compatibility ownership clearer.
- The full `counterfact` installation remains straightforward.

### Costs and risks

- The initial monorepo move changes build, test, documentation, packaging, and
  release paths even though user behavior should not change.
- Yarn 1 workspace orchestration is limited; root scripts and TypeScript project
  references must provide deterministic build order.
- Moving npm-shipped documentation can break website or package links unless
  both installed-tarball and site builds are checked.
- New packages increase release and dependency-update volume.
- Premature public exports would turn implementation details into SemVer
  obligations.
- Generated code currently receives copied shared types; changing that design
  during extraction would combine two migrations and expand risk.

### Work deliberately left for later

- generating a production TypeScript SDK;
- consuming models generated by a third-party tool;
- HAR import and record/replay;
- persistent simulator state;
- changing the generated route/type directory contract; and
- replacing Yarn or Changesets.

## Advice

- Preserve `counterfact` as the product-level installation and compatibility
  facade throughout the migration. (Patrick McElhaney)
- Extract from leaves toward orchestration: types, OpenAPI, generator/runtime,
  client, REPL, then facade cleanup.
- Treat an installed tarball, not a successful workspace import, as proof that
  a package is consumable.
- Prefer narrow interfaces and injected callbacks when a low-level package
  currently reaches upward for telemetry, configuration, or lifecycle policy.
- Do not create a general `shared`, `common`, or `core` package merely to make a
  cycle disappear. Move a concept to its actual owner or define a small public
  contract at the dependency boundary.
- Keep each extraction independently releasable and compare observable behavior
  before and after the move.
