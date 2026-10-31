# Package verification

Run `yarn test:package-closures` to check every package outside the monorepo,
including the full Counterfact packed-consumer compatibility checks. Dependencies
must already be installed, but a separate `yarn build` is unnecessary.

The runner clears Counterfact's TypeScript build metadata and packs `counterfact`
with lifecycle scripts enabled. Its self-contained prepack build produces all
workspace artifacts. The runner then packs the other packages without repeating
those builds. All tarballs are ready before consumer checks start.

Each package gets a fresh temporary consumer containing its declared internal
dependency closure. Two consumers run at a time. Checks cover installed public
imports, rejection of private deep imports, declaration compilation, shipped
examples, required files, and exclusion of source, tests, and build metadata.
The Counterfact consumer additionally checks the installed CLI, runtime,
generated-file hashes, and generated-code compilation.
The assertions for the existing [public package contract](public-package-contract.md)
remain in the packed-consumer verifier.

The npm download cache survives runs; consumers and tarballs do not. Set
`COUNTERFACT_PACKAGE_CACHE` to choose a cache directory. Installs prefer cached
metadata but can fetch missing dependencies, so a cold cache still needs network
access. CI restores this cache independently of its fresh consumer directories.
Command timings and a suite total help distinguish builds, installs, and checks.

`yarn test:packed-consumer` remains available for a standalone Counterfact check
and for `--update-fixtures`. Do not run it in addition to package closures for
routine validation: the latter already executes those assertions.
`yarn test:packaging-runner` runs fast regression checks for rejection of omitted
published documents.

Keep packaging separate from unit and product tests that read workspace `dist`:
prepack replaces build output. Consumer concurrency is safe only after all builds
and packs finish. The runner waits for both workers to settle before cleanup,
including when a consumer fails.

These checks use local tarballs for the internal packages and disable consumer
install scripts. They do not verify publication credentials, registry publication,
or every package-manager and dependency-hoisting layout. The closure declaration
checks also use the repository's TypeScript compiler and Node type declarations.
