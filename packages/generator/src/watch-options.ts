/** Generator-owned watcher policy, independent of the Counterfact runtime. */
export const CHOKIDAR_OPTIONS = {
  ignoreInitial: true,
  usePolling: process.platform === "win32",
};
