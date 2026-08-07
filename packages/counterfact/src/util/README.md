# `src/util/` — Shared Utilities

This directory contains small, general-purpose helper modules that are used by multiple parts of the codebase. Each module has a single, well-defined responsibility and no dependencies on other Counterfact modules.

## Files

| File                         | Description                                                      |
| ---------------------------- | ---------------------------------------------------------------- |
| `ensure-directory-exists.ts` | Creates missing parent directories before writing a file         |
| `forward-slash-path.ts`      | Normalizes path joins and resolutions for generated import paths |
| `load-config-file.ts`        | Reads and validates Counterfact JSON or YAML configuration files |
