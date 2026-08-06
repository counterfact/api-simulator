/**
 * Default options passed to every chokidar watcher in Counterfact.
 *
 * - `ignoreInitial: true` — suppresses the initial `"add"` events emitted for
 *   files already present when the watcher starts.
 * - `usePolling: true` on Windows — chokidar's native FSEvents are unreliable
 *   on Windows; polling is more reliable there.
 */
export const CHOKIDAR_OPTIONS = {
  ignoreInitial: true,
  usePolling: process.platform === "win32",
};
