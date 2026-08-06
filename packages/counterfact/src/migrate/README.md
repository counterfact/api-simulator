# `src/migrate/` — Migration Utilities

This directory contains one-time migration scripts that update the on-disk file structure when Counterfact changes how it organises generated files.

These scripts are invoked automatically by the CLI when an older project layout is detected. They are not part of the normal runtime path.

## Files

| File | Description |
|---|---|
| `paths-to-routes.js` | Copies files from the old `paths/` directory to the new `routes/` directory, rewriting internal import paths as needed |
| `update-route-types.js` | Regenerates TypeScript type definition files for route handlers to match the current type format |

## When to Use

You should not need to run these scripts manually. The CLI detects when a migration is needed and runs the appropriate script automatically. If you are developing Counterfact itself and want to test a migration, you can invoke the scripts directly:

```sh
node src/migrate/paths-to-routes.js <basePath>
node src/migrate/update-route-types.js <openApiPath> <basePath>
```
