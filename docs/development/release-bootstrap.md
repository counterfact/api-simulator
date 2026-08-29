# Release operations

`yarn release:preflight` performs a frozen install under Node 24 with npm
11.5.1 or newer, then runs package boundaries, exact tarball closures, and
registry-aware npm packaging dry runs for every public workspace before
checking Changesets status. Unpublished versions use `npm publish --dry-run`;
versions already present on npm use `npm pack --dry-run`. The preflight never
authenticates or publishes.

Normal publication is automatic with a manual recovery path:

1. A qualifying push to `main` runs the prepare job. Pending changesets create
   or update the Changesets version pull request.
2. Review and merge that version pull request. Its `changeset version` step is
   the one intentional lockfile-writing boundary and is followed by
   `yarn install --mode skip-build --no-immutable` so changed workspace versions
   are recorded in `yarn.lock`.
3. A later qualifying push with no pending changesets reruns preflight, installs
   immutably, rebuilds the verified artifacts, and publishes through GitHub
   OIDC with provenance.
4. Use the Release workflow's manual dispatch only to retry or recover
   publication. It follows the same preflight and immutable-publication path.
5. Verify package contents, provenance, versions, and installability on npm
   before any release announcement. Announcement remains a separate action.

Keep the `npm-publish` environment name, OIDC permission, provenance setting,
and npm trusted-publisher configuration aligned with
`.github/workflows/release.yaml`. Never infer that packages were published from
the preparation job alone; confirm the publish job and registry versions.

## Historical first-release bootstrap

The initial creation of the six `@counterfact` packages and their trusted
publisher configuration was a one-time maintainer-approved operation completed
after the package-oriented monorepo migration. It is retained in repository
history and is not part of the current release procedure.
