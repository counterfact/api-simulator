# Dependencies and maintained examples

Paths and commands below are relative to the repository root.

- Keep maintained examples eligible for Renovate updates; do not exclude `**/examples/**` in `ignorePaths`. Preserve the other dependency, vendor, test, and fixture exclusions when editing that array.

- Validate `examples/first-10-minutes` with its own `npm ci` and `npm run verify`; its npm lockfile is independent of the root Yarn lockfile. Prefer a disposable copy for this check: generation writes routes, types, and caches into the example, and those outputs can cause unrelated root lint failures if left in the worktree.

- For security overrides across major versions, scope the override to the affected parent and verify the API and module format it consumes with a real behavior check. Root Yarn resolutions and npm overrides repair only their installation roots; they are not inherited by consumers of published workspace packages.

- Keep weekly Renovate lockfile maintenance enabled for the root, documentation site, and maintained tutorial. Direct dependency updates can preserve vulnerable transitive versions; each independent lockfile needs its own refresh and validation.

- Keep Renovate `gitIgnoredAuthors` aligned with the author used by the Changesets workflow so automated release-metadata commits do not mark dependency PRs as manually edited.

- Renovate security-fix ingestion also requires the installed GitHub app to have read access to Dependabot alerts; repository configuration alone does not establish that permission.
