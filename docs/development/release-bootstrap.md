# Release bootstrap

`yarn release:preflight` performs a frozen install under Node 24 with npm
11.5.1 or newer, then runs package boundaries, exact tarball closures, and
Changesets status. It never publishes.

Publication remains gated:

1. Ordinary pushes to `main` run the ungated prepare job, which creates or
   updates the Changesets version pull request. Review and merge that pull
   request before requesting publication.
2. For the first scoped-package release only, a maintainer must explicitly
   approve npm authentication and initial package creation. Do not store that
   credential in the repository.
3. After each package exists, configure its npm trusted publisher for
   `counterfact/api-simulator` and `.github/workflows/release.yaml`. Verify all
   six package settings before enabling the workflow environment.
4. Manually dispatch the Release workflow with `publish` enabled. Its ungated
   prepare job reruns the full preflight; the downstream publish job is skipped
   if changesets remain. Approve the `npm-publish` environment only after the
   preflight and merged version diff pass.
5. The gated job installs from the frozen lockfile, rebuilds the verified
   artifacts, and publishes through GitHub OIDC without a long-lived npm
   token. Lifecycle scripts stay disabled during `npm publish` so each package
   uses that single release build.
6. Verify package contents, provenance, and installability on npm before any
   release announcement. Announcement is a separate, explicit approval.

The migration branch must not authenticate, create packages, publish, change
trusted-publisher settings, or announce a release.
