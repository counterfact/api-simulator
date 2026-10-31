# Contributing

## Where I need help

- **Feedback:** First and foremost, send me feedback. What makes sense? What's confusing? What's missing? What's broken? [Send me an email](mailto:pmcelhaney@gmail.com), [open an issue](https://github.com/counterfact/api-simulator/issues/new), or [start a discussion](https://github.com/counterfact/api-simulator/discussions).
- **Documentation:** There are probably typos in this very document. Please send PRs, large and small. You can do it right from your browser. If you're viewing this document in GitHub, click the pencil button in the top right corner.
- **Graphic design:** I'm terrible at graphic design. I know good design when I see it, and I can tell you why it's good, but struggle with the creative process. Whether it's building a web site, designing a logo, brainstorming on a GUI, or fixing up some ugly Markdown code, I'll take whatever help I can get!
- **Tests:** Test coverage is pretty good, but there are gaps. Filling those gaps is an easy way to gain some familiarity with the codebase.
- **Code generation:** Improve OpenAPI coverage and the TypeScript AST-based generator in [`packages/generator`](./packages/generator/README.md). Add focused coverage for generated types and preservation of authored handlers.
- **New features and bug fixes:** See the [issues list](https://github.com/counterfact/api-simulator/issues). If you plan on working on something, please add a comment and/or assign yourself.
- **Spread the word!** If you find this project useful, please let others know about it. Share it in your team Slack, on social media, etc.

## Development

This is a Yarn 4 workspace monorepo. The published application is in
`packages/counterfact`; repository-wide tooling, examples, black-box tests, and
the documentation website remain at the root.

```sh
git clone git@github.com:counterfact/api-simulator.git
cd api-simulator
corepack enable
yarn install
yarn build
yarn lint
yarn test
```

Unit tests use two workers and skip coverage collection for faster feedback.
Run `yarn test:coverage` to collect coverage and enforce the same thresholds as
CI. Focused commands such as `yarn test:generator` also skip coverage unless you
add `--coverage`.

The [code generator](./packages/generator/README.md) and [server runtime](./packages/runtime/README.md) are separate workspace packages. The `counterfact` package composes them with the CLI, client, and REPL. Guided tours live in [`packages/tutorials`](./packages/tutorials/README.md); add future chapter tours there. Root scripts coordinate builds and checks, so contributors do not need to change directories for the standard workflow.

### Try the guided tour from a checkout

After pulling changes that add or update workspace packages, refresh the
dependency links with `yarn install --immutable`. Building compiles the packages;
installation makes them available to Node.

From the repository root, run:

```sh
yarn go:first-run
```

Like the other `go:*` launchers, this builds the current checkout and runs its
CLI from the repository root. It passes no arguments, reproducing
`npx counterfact@latest` with this branch's code as the installed version.
Normal configuration detection applies: a `counterfact.yaml` bypasses the
intro. Use an interactive terminal with `CI` unset to see the menu when no
config exists. Generated tutorial files stay in the repository directory.

Choose **Try a guided example**. Running the built CLI exercises this checkout;
`npx counterfact@latest` uses the published release. Keep the checkout available
because generated lesson checks load its tutorial helpers. The [guided-example
chapter](./packages/counterfact/docs/manual/guided-example.md) describes the
exercise, restart behavior, and follow-up guides.

### Black-box test timings

Run `yarn test:black-box` to build the application and execute every product
journey. After an existing build, `yarn test:black-box:run` executes the same
suite without rebuilding; CI uses this command after its workspace build.
Both commands report the ten slowest pytest setup, call, or teardown phases.
CI caches Yarn and pip downloads, while still installing dependencies into each
fresh job and enforcing the Yarn lockfile.

### Build feedback

Run `yarn build` from the repository root to build the development workspaces.
It reports each stage as it starts and finishes, with elapsed times and a final
build summary. Compiler diagnostics remain visible, and a failed stage stops
the build with a nonzero exit status.

This progress output belongs to repository tooling. The published Counterfact
CLI and the workspace build used for packaging keep their own behavior.

### Development container

Counterfact includes a [Development Container](./.devcontainer/devcontainer.json)
for a reproducible Node 24, Yarn 4, and Python environment. It is intended for
local development and testing; it does not grant a coding agent access outside
the checked-out repository.

Install Docker Desktop and a Dev Containers-compatible editor, then open this
repository and choose **Reopen in Container**. The container enables Corepack;
its post-create setup installs the immutable Yarn dependency tree and installs
the Python dependencies used by the black-box test suite into a container-local
virtual environment.

Run the full Linux CI-equivalent check inside the container with:

```sh
bash .devcontainer/verify.sh
```

### Isolated change workspaces

Use a separate Git worktree and branch for each task. Install dependencies with
`yarn install --immutable`, then use the root scripts for the affected packages.
Run `yarn lint`, `yarn typecheck`, and appropriate tests before submitting a PR.
For installed-package verification, run `yarn test:package-closures`; it includes
the Counterfact packed-consumer checks. See [package verification](./docs/development/package-verification.md)
for coverage, cache settings, and standalone commands.
Build required workspace dependencies before tests that consume their `dist`
output, and finish packing/prepack checks before running those tests.
Use `.devcontainer/verify.sh` for the complete Linux verification sequence.

### Documentation drift checks

Run `yarn check:drift` from the repository root to check documentation and agent
guidance against related Git-tracked changes. The pinned `catchmydrift` development
dependency reads [`catchmydrift.config.json`](./catchmydrift.config.json).

Selected documents have explicit watch rules connected to named
implementation, configuration, and test groups. For example, the route-builder
guide follows the client builder/catalog/HTTP transport and REPL integration;
state guides follow context loading and registries; the REPL _skill_ follows the
HTTP admin API it actually describes. The migration and utility READMEs follow
their own modules rather than the whole application.

Package READMEs and the whole-product README, FAQ, API reference, comparison, and
design principles retain package-level scopes because they describe those full
interfaces. Navigation indexes follow their linked guide inventory;
agent instructions follow the referenced guidance and test conventions.

The default threshold is 10%, used as a review reminder. Implementation groups
exclude Markdown, fixtures, and snapshots so prose and generated test artifacts
do not dilute code measurements. Guide-navigation and agent-guidance groups
include the Markdown they directly describe. Lockfiles, changelogs, historical
studies, issue proposals, and ADRs are not watched; they record dependencies or
historical decisions rather than current behavior. This check is opt-in and is
not a required CI gate. Relationships operate at file granularity: a change to
an unrelated function in a shared module can still contribute drift.

The dated monorepo retrospective and lint-warning assessment are historical
records with commit-pinned context. They are excluded from ongoing implementation
watches; current compatibility and contributor guides remain watched.

Read the diagnostic when a check exits unsuccessfully: a percentage above the threshold requests document review, while an unhealthy-state or configuration message means the check could not complete. Drift measures changed lines since the newer of the watched file's last update or recorded review, so a successful setup can still report existing drift.

Read each reported document alongside its related changes and update inaccurate
guidance. If the document is still accurate after review, record that assessment:

```sh
yarn catchmydrift review packages/runtime/README.md
```

Commit the assessed document and related changes before running `review`. It records the current commit in `.catchmydrift-state.json`, an unversioned mapping from watched document paths to full commit SHAs. Commit that state update when the assessment should be shared. The checker requires those commits to be reachable from the current branch; older snapshot/token records require migration. Do not bulk-mark documents as reviewed just to
make the check pass. See the [catchmydrift documentation](https://github.com/pmcelhaney/catchmydrift)
for thresholds and review-state behavior.

### Mutation testing

Mutation testing runs against one workspace package at a time so reports stay actionable and CI can process packages in parallel.
Build the workspaces before mutation testing because integration tests consume compiled dependencies from other packages.

```sh
yarn build
yarn test:mutation:dry --package openapi
yarn test:mutation --package openapi
yarn test:mutation:incremental --package openapi
```

The supported package names are `client`, `counterfact`, `generator`, `openapi`, `repl`, and `runtime`.
Omit `--package` to run all mutable production packages together.
Use `--force` with the incremental command to refresh every mutant instead of reusing unchanged results.
Detailed HTML and JSON reports are written to `reports/mutation/<package>/` and are not committed.

The mutation-testing workflow currently runs on Monday mornings and by manual dispatch rather than as a required pull-request check.
After two stable full baselines, maintainers can record per-package thresholds and enable the planned no-regression pull-request gate.

Testing and linting changes is important, but at this point I'm more concerned about changing the word "I" in this page to "we", so don't hesitate to create a PR, even it's not "finished".

Thanks in advance!
