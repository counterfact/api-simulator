# `src/migrate/` — Migration Utilities

This directory contains one-time migration scripts that update the on-disk file structure when Counterfact changes how it organises generated files.

These scripts are invoked automatically by the CLI when an older project layout is detected. They are not part of the normal runtime path.

## Files

| File                    | Description                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `paths-to-routes.ts`    | Copies files from the old `paths/` directory to the new `routes/` directory, rewriting internal import paths as needed |
| `update-route-types.ts` | Updates route handler type imports and exported type names to match the current type format                            |

## When to Use

The CLI detects when a migration is needed and calls these exported functions
automatically. These modules have no standalone command-line interface.

For contributor verification, use the migration tests in
[`test/migrate/`](../../test/migrate/). The functions are
`pathsToRoutes(basePath)` and `updateRouteTypes(basePath, openApiPath)`; the latter
updates handler imports and names rather than generating the type-definition
files themselves.
