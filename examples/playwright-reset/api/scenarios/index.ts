import type { Context } from "../routes/_.context.js";

type ScenarioArgument = { context: Context };

export async function startup({ context }: ScenarioArgument) {
  await Promise.resolve();
  context.store.projects.push({ id: 1, name: "Customer portal" });
}

// An explicit contraction: remove projects while preserving unrelated state.
export function emptyProjects({ context }: ScenarioArgument) {
  context.store.projects.length = 0;
}
