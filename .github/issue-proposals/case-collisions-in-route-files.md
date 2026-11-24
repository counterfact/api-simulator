---
title: Handle route paths that differ only by case on case-insensitive file systems
labels:
  - bug
  - generator
assignees: []
milestone:
---

OpenAPI paths are case-sensitive, so a spec can declare both `/Companies/{id}` and `/companies/{id}`. Counterfact writes one route file per path under `routes/`, and on a case-insensitive file system (the default on macOS and Windows) those two files are the same file. Handlers for one path are appended to the other's file, and the runtime serves both URLs from whichever spelling the file system kept.

Generated type files are already written to case-safe paths. Route files cannot be renamed the same way, because the runtime derives each URL from its route file's path.

## Acceptance criteria

- [ ] Generating a spec with paths that differ only by case does not silently merge their handlers into one route file.
- [ ] The runtime serves each declared path, with its own handlers, on a case-insensitive file system.
- [ ] If both paths cannot be represented, generation reports which paths collide instead of writing a merged file.
- [ ] A test covers paths that differ only by case in a directory segment and in the final segment.
