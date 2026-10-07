/* eslint-disable security/detect-non-literal-fs-filename -- caller-selected root is read only and the worker verifies its filesystem identity before scanning. */
import { fork } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";

import type { DiscoveredSpecs } from "./discover-openapi-worker.js";

export { isSupportedOpenApiDocument } from "./discover-openapi-worker.js";
export type { DiscoveredSpecs } from "./discover-openapi-worker.js";

const SEARCH_TIMEOUT_MS = 15_000;

function isDiscoveryResult(value: unknown): value is DiscoveredSpecs {
  if (typeof value !== "object" || value === null) return false;
  const result = value as DiscoveredSpecs;
  return (
    Array.isArray(result.specs) &&
    result.specs.every((spec) => typeof spec === "string") &&
    typeof result.limited === "boolean" &&
    typeof result.unreadable === "boolean"
  );
}

export async function discoverOpenApiSpecs(
  directory: string,
  signal?: AbortSignal,
): Promise<DiscoveredSpecs> {
  const empty: DiscoveredSpecs = {
    specs: [],
    limited: false,
    unreadable: false,
  };
  if (signal?.aborted) return empty;
  try {
    const rootStat = await stat(directory, { bigint: true });
    if (!rootStat.isDirectory()) return { ...empty, unreadable: true };
    const root = await realpath(directory);
    if (signal?.aborted) return empty;
    // A separate process lets discovery pin cwd without changing the CLI's cwd.
    // Source tests use Node's TypeScript support; published packages use .js.
    const workerPath = fileURLToPath(
      new URL(
        `./discover-openapi-worker${extname(import.meta.url)}`,
        import.meta.url,
      ),
    );
    const worker = fork(
      workerPath,
      [
        JSON.stringify({
          dev: String(rootStat.dev),
          ino: String(rootStat.ino),
        }),
      ],
      { cwd: root, stdio: ["ignore", "ignore", "ignore", "ipc"] },
    );
    return await new Promise<DiscoveredSpecs>((resolve) => {
      let finished = false;
      const finish = (result: DiscoveredSpecs) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        signal?.removeEventListener("abort", cancel);
        worker.kill();
        resolve(result);
      };
      const cancel = () => finish(empty);
      const timeout = setTimeout(
        () => finish({ ...empty, limited: true }),
        SEARCH_TIMEOUT_MS,
      );
      worker.on("message", (message: unknown) => {
        finish(
          isDiscoveryResult(message) ? message : { ...empty, unreadable: true },
        );
      });
      worker.on("error", () => finish({ ...empty, unreadable: true }));
      worker.on("exit", () => finish({ ...empty, unreadable: true }));
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
    });
  } catch {
    return { ...empty, unreadable: true };
  }
}
