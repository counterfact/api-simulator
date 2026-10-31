import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import type { REPLServer } from "node:repl";
import { walkthroughWorkspace } from "./coffee-shop-workspace.js";

export type ReplSubmission = { id: string; command: string };
const histories = new Map<string, ReplSubmission[]>();
const attached = new WeakSet<REPLServer>();

/** Opt-in local transcript capture. Never reads results or publishes raw input to telemetry. */
export async function createTourReplObserver(root: string) {
  try {
    if (!(await walkthroughWorkspace(root)).enabled) return;
    const key = await realpath(root);
    const history = histories.get(key) ?? [];
    histories.set(key, history);
    return (server: REPLServer) => {
      if (attached.has(server)) return;
      attached.add(server);
      const submitted = (line: string) => {
        if (line.trim())
          history.push({ id: randomUUID(), command: line.trimEnd() });
      };
      const detach = () => {
        server.off("line", submitted);
        server.off("close", detach);
        server.off("exit", detach);
      };
      server.on("line", submitted);
      server.once("close", detach);
      server.once("exit", detach);
    };
  } catch {
    // An unavailable transcript must not prevent starting the normal REPL.
    return;
  }
}

export async function readTourReplSubmissions(
  root: string,
): Promise<ReplSubmission[]> {
  return [...(histories.get(await realpath(root)) ?? [])];
}
