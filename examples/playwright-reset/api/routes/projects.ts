import type { Context } from "./_.context.js";

export function GET({ context }: { context: Context }) {
  return { body: context.store.projects };
}

export function DELETE({ context }: { context: Context }) {
  context.store.projects.length = 0;
  return { status: 204 };
}
