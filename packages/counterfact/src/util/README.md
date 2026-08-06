# `src/util/` — Shared Utilities

This directory contains small, general-purpose helper modules that are used by multiple parts of the codebase. Each module has a single, well-defined responsibility and no dependencies on other Counterfact modules.

## Files

| File                         | Description                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ensure-directory-exists.ts` | Creates a directory (and any missing parents) synchronously before writing a file                                             |
| `wait-for-event.ts`          | Returns a `Promise` that resolves when a named event fires on an `EventEmitter` or `EventTarget`                              |
| `windows-escape.ts`          | Escapes colons in Windows file paths (e.g. `C:\...`) using a Unicode ratio symbol to avoid conflicts in URLs and import paths |
