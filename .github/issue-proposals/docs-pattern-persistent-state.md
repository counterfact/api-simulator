---
title: "docs: add Persistent State usage pattern"
parentIssue: 1805
labels:
  - documentation
  - enhancement
assignees: []
milestone:
---

Add a usage pattern for persisting Counterfact context state to disk so that it survives server restarts.

## Context

Counterfact's in-memory state resets to its initial values every time the server restarts. This is intentional and usually desirable during development — it provides a clean slate. However, some workflows need state to survive restarts:

- **Shared demo environments**: a team seeds realistic data and then shares the mock across a demo session that spans multiple days. Restarting the server to pick up a new version of a handler file should not wipe the demo data.
- **Long-running integration environments**: a staging or QA environment runs the mock for days or weeks; testers build up test data over multiple sessions.
- **Seeded fixtures**: a project ships a `seed.json` file with canonical test data that is loaded at startup rather than recreated by hand after every restart.

Counterfact currently has no built-in persistence mechanism. Workarounds involve writing a startup script that calls context methods to re-seed data, or serializing context state to a file manually and loading it back in a custom startup hook.

## Proposed feature

Add a `--persist-state <path>` CLI flag (or a `persist` option in `counterfact.yaml`) that:

1. At shutdown, serializes the context's state to a JSON file at the specified path.
2. At startup, loads the JSON file and hydrates the context before the server begins accepting requests.

Context classes would opt in by implementing `toJSON()` and `fromJSON(data)` methods (or a similar convention). This keeps the persistence mechanism decoupled from the context class interface.

A `Persistent State` pattern document would describe:

- When to use it: shared demo environments, long-running QA mocks, or fixture-based seeding
- How to enable persistence with `--persist-state`
- How to implement `toJSON` / `fromJSON` in a context class
- Consequences: state files can drift from the spec; schema migrations are the author's responsibility; not suitable for high-concurrency scenarios

## Acceptance criteria

- [ ] `--persist-state <path>` CLI flag (or equivalent) is implemented
- [ ] Context classes can opt in to persistence by implementing a documented interface
- [ ] `packages/counterfact/docs/patterns/persistent-state.md` is added following the established pattern format
- [ ] The new pattern is linked in `packages/counterfact/docs/patterns/index.md`
- [ ] The reference doc is updated to describe the new CLI flag and context interface
