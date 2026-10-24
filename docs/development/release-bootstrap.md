# Release bootstrap

`yarn release:preflight` performs a frozen install under Node 24 with npm
11.5.1 or newer, then runs package boundaries, exact tarball closures, and
registry-aware npm packaging dry runs for every public workspace before
checking Changesets status. Unpublished versions use `npm publish --dry-run`;
versions already present on npm use `npm pack --dry-run`. The preflight never
authenticates or publishes.

## Current release flow

1. A push to `main` runs the Release workflow's prepare job and its preflight.
   When changesets remain, the job creates or updates the Changesets version
   pull request. Review that version diff before merging it.
2. `yarn release:version` applies Changesets versions and refreshes `yarn.lock`
   with `yarn install --mode skip-build --no-immutable`. The version pull request
   must contain the matching manifests and lockfile.
3. When the prepare job reports no remaining changesets, either a push to
   `main` or a manual Release workflow dispatch can run the publish job. A main
   push after the version pull request merges therefore publishes the merged
   versions automatically. Manual dispatch is the retry/recovery path; there
   is no `publish` checkbox or dispatch input.
4. The publish job uses the `npm-publish` environment, installs the frozen
   dependency tree, rebuilds the artifacts, and publishes with GitHub OIDC and
   npm provenance. Lifecycle scripts stay disabled during publication so the
   packages use that release build. Environment approval requirements depend
   on protection rules configured in GitHub; the workflow's environment name
   alone does not establish that a human approval is required.
5. Verify package contents, provenance, and installability on npm before a
   release announcement. Announcement requires separate authorization.

## Initial scoped-package bootstrap

These steps describe the initial package-oriented monorepo release, rather than
work to repeat for every release:

- A maintainer must explicitly approve npm authentication and initial package
  creation. From a clean checkout of `main`, run `yarn release:preflight`, then
  `yarn release` while authenticated as a publisher for the `@counterfact`
  scope. Changesets skips package versions already present on npm and publishes
  new public workspaces with their manifest-defined public access. Do not store
  that credential in the repository.
- After each package exists, configure its npm trusted publisher for
  `counterfact/api-simulator` and `.github/workflows/release.yaml`. Verify the
  six scoped package settings and configure the workflow environment's
  protection rules before relying on automated publication.

The migration branch must not authenticate, create packages, publish, change
trusted-publisher settings, or announce a release. This document does not verify
current registry or GitHub environment settings.
