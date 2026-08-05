import { access } from "node:fs/promises";
import path from "node:path";

import { type FSWatcher, watch } from "chokidar";

import { waitForEvent } from "../util/wait-for-event.js";
import { CHOKIDAR_OPTIONS } from "./constants.js";
import { determineModuleKind } from "./determine-module-kind.js";
import { uncachedImport } from "./uncached-import.js";

const { uncachedRequire } = await import("./uncached-require.cjs");

type Store = object;

interface StoreModule {
  Store: new () => Store;
}

export interface StoreLoaderCallbacks {
  onSourcePresenceChange?: (present: boolean) => Promise<void> | void;
  onStoreChange?: (store: Store) => Promise<void> | void;
}

/**
 * Loads and watches the conventional application-level `_.store.ts` module.
 * A successfully loaded store keeps its identity for this loader's lifetime.
 */
export class StoreLoader {
  public readonly sourcePath: string;

  public store: Store | undefined;

  private readonly callbacks: StoreLoaderCallbacks;

  private initialized = false;

  private sourcePresent = false;

  private watcher: FSWatcher | undefined;

  private eventQueue: Promise<void> = Promise.resolve();

  public constructor(basePath: string, callbacks: StoreLoaderCallbacks = {}) {
    this.sourcePath = path.resolve(basePath, "_.store.ts");
    this.callbacks = callbacks;
  }

  /**
   * Performs the initial load. An absent source is a supported, disabled state.
   */
  public async load(): Promise<Store | undefined> {
    if (this.initialized) return this.store;

    if (!(await this.fileExists())) {
      this.sourcePresent = false;
      this.initialized = true;
      return undefined;
    }

    this.sourcePresent = true;
    const candidate = await this.importCandidate();
    this.store = candidate;
    this.initialized = true;
    return candidate;
  }

  /** Watches the exact conventional path, including while it is absent. */
  public async watch(): Promise<void> {
    if (this.watcher !== undefined) return;

    // Watch the parent directory rather than the specific file so that
    // chokidar can reliably detect file creation on Windows. Watching a
    // non-existent file path is unreliable on Windows with native fs.watch.
    this.watcher = watch(path.dirname(this.sourcePath), {
      ...CHOKIDAR_OPTIONS,
      // This is a single shallow directory, so polling is inexpensive and
      // avoids platform-specific native watcher limits and missed adds.
      usePolling: true,
      awaitWriteFinish: { pollInterval: 10, stabilityThreshold: 50 },
      depth: 0,
    }).on("all", (eventName: string, filePath: string) => {
      if (
        eventName !== "add" &&
        eventName !== "change" &&
        eventName !== "unlink"
      ) {
        return;
      }

      this.enqueue(async () => {
        if (path.resolve(filePath) === this.sourcePath) {
          await this.handleWatchEvent(eventName);
        } else {
          // A write can be reported through a temporary path before it is
          // renamed to the conventional source. Reconcile the exact path so
          // those platform-specific event paths cannot hide a transition.
          await this.reconcileAfterReady();
        }
      });
    });

    await waitForEvent(this.watcher, "ready");

    // Reconcile after the initial scan because ignoreInitial deliberately
    // suppresses add events. This also closes the load-to-watch race.
    this.enqueue(async () => {
      await this.reconcileAfterReady();
    });
    await this.eventQueue;
  }

  /** Stops the watcher after all already-received events have settled. */
  public async stopWatching(): Promise<void> {
    const watcher = this.watcher;
    this.watcher = undefined;
    await watcher?.close();
    await this.eventQueue;
  }

  private enqueue(operation: () => Promise<void>): void {
    this.eventQueue = this.eventQueue
      .then(operation)
      .catch((error: unknown) => {
        this.writeDiagnostic(error);
      });
  }

  private async handleWatchEvent(
    eventName: "add" | "change" | "unlink",
  ): Promise<void> {
    if (eventName === "unlink") {
      await this.updateSourcePresence(false);
      this.initialized = true;
      if (this.store !== undefined) {
        throw new Error("the store source was deleted");
      }
      return;
    }

    await this.updateSourcePresence(true);
    const candidate = await this.importCandidate();
    await this.applyCandidate(candidate);
    this.initialized = true;
  }

  private async reconcileAfterReady(): Promise<void> {
    const present = await this.fileExists();

    if (this.initialized && present === this.sourcePresent) return;

    if (!present) {
      await this.updateSourcePresence(false);
      this.initialized = true;
      if (this.store !== undefined) {
        throw new Error("the store source was deleted");
      }
      return;
    }

    await this.updateSourcePresence(true);
    const candidate = await this.importCandidate();
    await this.applyCandidate(candidate);
    this.initialized = true;
  }

  private async updateSourcePresence(present: boolean): Promise<void> {
    if (present === this.sourcePresent) return;
    this.sourcePresent = present;
    await this.callbacks.onSourcePresenceChange?.(present);
  }

  private async applyCandidate(candidate: Store): Promise<void> {
    if (this.store === undefined) {
      this.store = candidate;
      await this.callbacks.onStoreChange?.(candidate);
      return;
    }

    const liveStore = this.store;
    const newFields = Object.keys(candidate).filter(
      (key) => !Object.hasOwn(liveStore, key),
    );
    if (newFields.length > 0 && !Object.isExtensible(liveStore)) {
      throw new TypeError("the live store is not extensible");
    }

    const oldPrototype = Object.getPrototypeOf(liveStore) as object | null;
    const newPrototype = Object.getPrototypeOf(candidate) as object | null;
    const addedFields: string[] = [];

    try {
      Object.setPrototypeOf(liveStore, newPrototype);
      for (const key of newFields) {
        Object.defineProperty(liveStore, key, {
          configurable: true,
          enumerable: true,
          value: Reflect.get(candidate, key),
          writable: true,
        });
        addedFields.push(key);
      }
    } catch (error: unknown) {
      for (const key of addedFields) {
        Reflect.deleteProperty(liveStore, key);
      }
      Object.setPrototypeOf(liveStore, oldPrototype);
      throw error;
    }

    await this.callbacks.onStoreChange?.(liveStore);
  }

  private async importCandidate(): Promise<Store> {
    try {
      const doImport =
        (await determineModuleKind(this.sourcePath)) === "commonjs"
          ? uncachedRequire
          : uncachedImport;
      const imported = (await doImport(
        this.sourcePath,
      )) as Partial<StoreModule>;

      if (typeof imported.Store !== "function") {
        throw new TypeError('the module must export a constructable "Store"');
      }

      return new imported.Store();
    } catch (error: unknown) {
      throw this.createLoadError(error);
    }
  }

  private createLoadError(error: unknown): Error {
    const details = error instanceof Error ? error.message : String(error);
    return new Error(
      `Could not load store from "${this.sourcePath}": ${details}`,
      { cause: error },
    );
  }

  private writeDiagnostic(error: unknown): void {
    const details = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `Store reload failed for "${this.sourcePath}"; retaining the last good store. ${details}\n`,
    );
  }

  private async fileExists(): Promise<boolean> {
    try {
      await access(this.sourcePath);
      return true;
    } catch {
      return false;
    }
  }
}
