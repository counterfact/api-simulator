# `src/migrate/` — Migration Utilities

This directory contains one-time migration scripts that update the on-disk file structure when Counterfact changes how it organises generated files.

The CLI runs these compatibility checks during startup. Layout migration runs
when a legacy `paths/` directory exists; route type-name migration checks the
configured API groups and changes only eligible legacy bindings. Programmatic
`counterfact()` startup does not invoke these CLI migration checks.

## Files

| File                    | Description                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `paths-to-routes.ts`    | Copies files from the old `paths/` directory to the new `routes/` directory, rewriting internal import paths as needed |
| `update-route-types.ts` | Updates route handler type imports and exported type names to match the current type format                            |

## When to Use

Let the CLI select these migrations during startup. These modules have no
standalone command-line interface.

For contributor verification, use the migration tests in
[`test/migrate/`](../../test/migrate/). The functions are
`pathsToRoutes(basePath)` and
`updateRouteTypes(basePath, openApiPath, overlays?)`. The latter skips spec-free
(`_`) projects and context files. It renames bindings imported from generated
path-type modules while preserving unrelated imports and local declarations;
type-definition generation belongs to the generator.
