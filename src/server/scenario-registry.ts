type ScenarioModule = Record<string, unknown>;

/**
 * Registry of loaded scenario modules.
 *
 * Scenario modules are plain JavaScript/TypeScript files that export named
 * functions.  Each module is keyed by a slash-delimited path relative to the
 * `scenarios/` directory (e.g. `"index"`, `"sub/reset"`).
 *
 * The registry is used by the REPL's `.scenario` command and by tab-completion
 * to enumerate available scenarios and their exported function names.
 */
export class ScenarioRegistry {
  private readonly modules = new Map<string, ScenarioModule>();

  /**
   * Registers (or replaces) a scenario module.
   *
   * @param key - Slash-delimited file key (e.g. `"index"`, `"auth/setup"`).
   * @param module - The module's exported values.
   */
  public add(key: string, module: ScenarioModule): void {
    this.modules.set(key, module);
  }

  /**
   * Removes the scenario module for `key`.
   *
   * @param key - The file key to remove.
   */
  public remove(key: string): void {
    this.modules.delete(key);
  }

  /**
   * Returns the module for `fileKey`, or `undefined` if not registered.
   *
   * @param fileKey - The file key to look up.
   */
  public getModule(fileKey: string): ScenarioModule | undefined {
    return this.modules.get(fileKey);
  }

  /**
   * Returns the names of all exported functions for the given file key.
   * Used for tab completion.
   */
  public getExportedFunctionNames(fileKey: string): string[] {
    const module = this.modules.get(fileKey);

    if (!module) return [];

    return Object.keys(module).filter((k) => typeof module[k] === "function");
  }

  /**
   * Returns all loaded file keys (e.g. "index", "myscript", "sub/script").
   * Used for tab completion to enumerate available scenario files.
   */
  public getFileKeys(): string[] {
    return [...this.modules.keys()];
  }
}
