# Hot reload

Save a route or context file and the running server picks it up without restarting. Route edits preserve live context state. Context edits update methods and apply field values that differ from their previous source initialization; fields with unchanged initialized values keep their live mutations.

For example, with `stock = 10` in your context source, purchases can reduce live stock to 7. Saving an unrelated method edit keeps stock at 7. Changing the initializer to `stock = 20` sets live stock to 20; unrelated fields keep their current values. For a fresh baseline across all managed state, use [simulator reset](./programmatic-api.md#resetting-a-running-simulator).

This makes it fast to set up edge cases like:

- What does the UI do 8 clicks deep when the server returns a 500?
- What if there are zero results? What if there are 10,000?
- What if the server is slow?

Find the file corresponding to the route, change behavior by editing the TypeScript code, and continue testing.

Depending on the scenario, you may want to commit your changes to source control or throw them away.

A [shared application store](../patterns/shared-store.md) is an optional class for data used across API groups. `basePath` is the API output directory. When `<basePath>/_.store.ts` exists, it is hot-reloaded separately from route
contexts. Counterfact preserves the live store object's identity and existing
fields, updates prototype methods, and adds newly declared enumerable fields.
An invalid edit or deletion keeps the last successfully loaded store active and
prints a diagnostic. See [Share State Across API Groups](../patterns/shared-store.md)
for the supported store-authoring model.

## See also

- [State](./state.md) — in-memory state that survives reloads
- [Patterns: Share State Across API Groups](../patterns/shared-store.md) — store-specific reload behavior across API groups
- [REPL](./repl.md) — make changes without touching files at all
- [Find your workflow](../usage.md)
