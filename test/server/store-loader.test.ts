import { jest } from "@jest/globals";
import { usingTemporaryFiles } from "using-temporary-files";

import { StoreLoader } from "../../src/server/store-loader.js";

describe("StoreLoader", () => {
  it("uses the absolute conventional path and treats an absent source as disabled", async () => {
    await usingTemporaryFiles(async ($) => {
      const loader = new StoreLoader($.path("."));

      await expect(loader.load()).resolves.toBeUndefined();
      expect(loader.store).toBeUndefined();
      expect(loader.sourcePath).toBe($.path("_.store.ts"));
    });
  });

  it("constructs exactly one live store during an idempotent initial load", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "_.store.ts",
        "export class Store { count = 1; constructor() { globalThis.__storeConstructions = (globalThis.__storeConstructions ?? 0) + 1; } }",
      );
      Reflect.set(globalThis, "__storeConstructions", 0);
      const loader = new StoreLoader($.path("."));

      const first = await loader.load();
      const second = await loader.load();

      expect(first).toBe(second);
      expect(Reflect.get(globalThis, "__storeConstructions")).toBe(1);
      Reflect.deleteProperty(globalThis, "__storeConstructions");
    });
  });

  it.each([
    ["has no Store export", "export const value = 1", "must export"],
    ["throws while loading", 'throw new Error("module boom")', "module boom"],
    [
      "throws while constructing",
      'export class Store { constructor() { throw new Error("constructor boom") } }',
      "constructor boom",
    ],
  ])("rejects when the initial module %s", async (_name, source, message) => {
    await usingTemporaryFiles(async ($) => {
      await $.add("_.store.ts", source);
      const loader = new StoreLoader($.path("."));

      await expect(loader.load()).rejects.toThrow(message);
      await expect(loader.load()).rejects.toThrow($.path("_.store.ts"));
      expect(loader.store).toBeUndefined();
    });
  });

  it("preserves identity and state while updating methods and adding only new own fields", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "_.store.ts",
        'export class Store { retained = "initial"; removed = "keep"; method() { return "old" } }',
      );
      const onStoreChange = jest.fn();
      const loader = new StoreLoader($.path("."), { onStoreChange });
      const store = (await loader.load()) as Record<string, unknown> & {
        method(): string;
      };
      store.retained = "runtime";
      await loader.watch();

      const changed = eventTargetForCallback(onStoreChange);
      jest.resetModules();
      await $.add(
        "_.store.ts",
        'export class Store { retained = "replacement"; added = 42; method() { return "new" } }',
      );
      await changed;

      expect(loader.store).toBe(store);
      expect(store).toMatchObject({
        added: 42,
        removed: "keep",
        retained: "runtime",
      });
      expect(store.method()).toBe("new");
      await loader.stopWatching();
    });
  });

  it("activates when the initially absent exact source is added", async () => {
    await usingTemporaryFiles(async ($) => {
      const onStoreChange = jest.fn();
      const onSourcePresenceChange = jest.fn();
      const loader = new StoreLoader($.path("."), {
        onSourcePresenceChange,
        onStoreChange,
      });

      await loader.load();
      await loader.watch();
      const changed = eventTargetForCallback(onStoreChange);
      await $.add("_.store.ts", "export class Store { active = true }");
      await changed;

      expect(loader.store).toMatchObject({ active: true });
      expect(onSourcePresenceChange).toHaveBeenCalledWith(true);
      await loader.stopWatching();
    });
  });

  it("retains the last good store and reports broken reloads and deletion", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "_.store.ts",
        'export class Store { value = "saved"; method() { return "good" } }',
      );
      const stderr = jest.spyOn(process.stderr, "write").mockReturnValue(true);
      const onSourcePresenceChange = jest.fn();
      const loader = new StoreLoader($.path("."), { onSourcePresenceChange });
      const store = (await loader.load()) as {
        method(): string;
        value: string;
      };
      await loader.watch();

      jest.resetModules();
      await $.add("_.store.ts", 'throw new Error("reload boom")');
      await waitForMock(stderr, 1);
      expect(loader.store).toBe(store);
      expect(store.method()).toBe("good");
      expect(stderr).toHaveBeenLastCalledWith(
        expect.stringContaining(`${$.path("_.store.ts")}"; retaining`),
      );
      expect(stderr).toHaveBeenLastCalledWith(
        expect.stringContaining("reload boom"),
      );

      await $.remove("_.store.ts");
      await waitForMock(stderr, 2);
      expect(loader.store).toBe(store);
      expect(onSourcePresenceChange).toHaveBeenLastCalledWith(false);
      expect(stderr).toHaveBeenLastCalledWith(
        expect.stringContaining("deleted"),
      );

      await loader.stopWatching();
      stderr.mockRestore();
    });
  });
});

function eventTargetForCallback(callback: jest.Mock): Promise<void> {
  return new Promise((resolve) => {
    callback.mockImplementationOnce(() => resolve());
  });
}

async function waitForMock(mock: jest.Mock, calls: number): Promise<void> {
  while (mock.mock.calls.length < calls) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
