# Build, packaging, releases, and CI

Paths and commands below are relative to the repository root.

- Root `go:*` launchers that use package-relative fixture paths must delegate to the package's script so the working directory matches those paths. Keep multi-API and multi-version demo output directories separate to avoid stale generated handlers crossing between examples.

- When spawning Yarn from a package script, use the Yarn command on PATH with Windows command-shim handling. Yarn 4 can set `npm_execpath` to a shell wrapper; passing that path to Node treats shell code as JavaScript. Validate the runner with `yarn test:build` on both CI operating systems.

- Keep the root development build stages aligned with `packages/counterfact/package.json` build order and commands. Preserve the self-contained workspace build for packaging; repository-only progress scripts must not become required files in published packages.

- `yarn test:package-closures` includes the Counterfact packed-consumer assertions.
  Prefer it over running both suites: it exercises the Counterfact prepack
  lifecycle once and shares tarballs across fresh consumers. Only the npm
  download cache is reused (`COUNTERFACT_PACKAGE_CACHE` overrides its location).
  Finish all builds and packs before running consumers concurrently, and await
  all active consumers before cleaning up after a failure.

- Black-box CI should build once in its isolated job and use
  `yarn test:black-box:run` against that output. Keep `yarn test:black-box`
  self-contained for local use. Cache dependency downloads rather than installed
  environments or workspace build output, and retain immutable Yarn installation
  and Python dependency installation on cache hits. Use pytest duration reporting
  to distinguish scenario costs from installation and build overhead.

- Run package packing/prepack checks separately from unit and product suites that consume workspace `dist` output. Prepack rebuilds can remove those files while another suite is loading them, causing false missing-module failures. Finish the package check before starting those suites.

- Quote glob arguments in package scripts when the receiving tool accepts the pattern.
  In particular, keep the `test:tsd` file pattern quoted: shell expansion of
  multiple files can turn an extra path into tsd's positional working directory.

- After Changesets versions workspace packages, run `yarn install --mode skip-build --no-immutable` so `yarn.lock` can match the new internal versions before immutable installation; CI enables Yarn immutability by default, so the explicit override is required in `release:version`.

- A push to `main` with no remaining changesets publishes the merged package versions automatically; a manual Release workflow dispatch is the retry and recovery path.

- Keep the `npm-publish` environment name, OIDC permission, and provenance setting aligned with the npm trusted-publisher configuration.

- When splitting CI into independent jobs, use separate workspaces for commands
  that rebuild output and tests that read it. Aggregate required checks must
  reject failed/canceled change classification and unexpected skipped jobs;
  accept skipped heavy checks only after successful docs-only classification.
  Preserve existing required status names or coordinate the ruleset migration.
  Root ESLint also needs built workspace exports to resolve package examples;
  run the build before lint in a fresh checkout.

- When a status check is required by a merge-queue ruleset, configure its workflow to run on `merge_group` with `checks_requested`; a `pull_request`-only workflow leaves the queue's synthetic commit without that check and eventually times out.

- When a pull-request workflow's decision depends on labels, include `labeled` and `unlabeled` activity types so a label change refreshes the required status rather than leaving a stale result.
