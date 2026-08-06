import { dirname, resolve } from "node:path";

import createDebug from "debug";
import precinct from "precinct";

const debug = createDebug("counterfact:server:module-dependency-graph");

/**
 * Tracks which route files depend on shared modules so that when a shared
 * module changes, all dependent route files can be reloaded.
 *
 * Dependency edges are extracted using [precinct](https://npm.im/precinct)'s
 * static analysis and are stored as a reverse map (`dependency → Set<dependent
 * files>`).
 */
export class ModuleDependencyGraph {
  private readonly dependents = new Map<string, Set<string>>();

  private loadDependencies(path: string) {
    try {
      return precinct.paperwork(path);
    } catch (error) {
      debug("could not load dependencies for %s: %o", path, error);
      return [];
    }
  }

  private clearDependents(path: string) {
    this.dependents.forEach((group) => {
      group.delete(path);
    });
  }

  /**
   * (Re-)indexes the dependency edges for `path`, replacing any previously
   * recorded edges.
   *
   * Only relative imports are tracked; node_modules dependencies are ignored.
   *
   * @param path - Absolute path of the file to analyse.
   */
  public load(path: string) {
    this.clearDependents(path);

    for (const dependency of this.loadDependencies(path)) {
      if (!dependency.startsWith(".")) {
        return;
      }

      const key = resolve(dirname(path), dependency);

      if (!this.dependents.has(key)) {
        this.dependents.set(key, new Set());
      }

      this.dependents.get(key)?.add(path);
    }
  }

  /**
   * Returns the transitive set of files that (directly or indirectly) import
   * `path`.
   *
   * Uses a BFS traversal so each dependent is returned exactly once.
   *
   * @param path - Absolute path of the changed dependency.
   * @returns A `Set` of absolute paths of all dependent files.
   */
  public dependentsOf(path: string) {
    const marked = new Set<string>();
    const dependents = new Set<string>();
    const queue = [path];

    while (queue.length > 0) {
      const file = queue.shift();

      if (file !== undefined && !marked.has(file)) {
        marked.add(file);

        const fileDependents = this.dependents.get(file);

        if (fileDependents) {
          for (const dependent of fileDependents) {
            dependents.add(dependent);
            queue.push(dependent);
          }
        }
      }
    }

    return dependents;
  }
}
