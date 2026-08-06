import { ScenarioRegistry } from "../../src/server/scenario-registry.js";

describe("ScenarioRegistry", () => {
  it("stores and retrieves a module by key", () => {
    const registry = new ScenarioRegistry();

    registry.add("index", { foo() {}, bar: 42 });

    expect(registry.getModule("index")).toBeDefined();
    expect(typeof registry.getModule("index")?.["foo"]).toBe("function");
  });

  it("returns undefined for an unknown key", () => {
    const registry = new ScenarioRegistry();

    expect(registry.getModule("missing")).toBeUndefined();
  });

  it("removes a module by key", () => {
    const registry = new ScenarioRegistry();

    registry.add("index", { foo() {} });
    registry.remove("index");

    expect(registry.getModule("index")).toBeUndefined();
  });

  it("returns only function names from getExportedFunctionNames", () => {
    const registry = new ScenarioRegistry();

    registry.add("index", {
      soldPets() {},
      resetAll() {},
      notAFunction: "string value",
      alsoNotAFunction: 42,
    });

    const names = registry.getExportedFunctionNames("index");

    expect(names).toContain("soldPets");
    expect(names).toContain("resetAll");
    expect(names).not.toContain("notAFunction");
    expect(names).not.toContain("alsoNotAFunction");
  });

  it("returns an empty array from getExportedFunctionNames for an unknown key", () => {
    const registry = new ScenarioRegistry();

    expect(registry.getExportedFunctionNames("missing")).toEqual([]);
  });

  it("returns all loaded file keys", () => {
    const registry = new ScenarioRegistry();

    registry.add("index", { foo() {} });
    registry.add("myscript", { bar() {} });
    registry.add("sub/script", { baz() {} });

    expect(registry.getFileKeys()).toEqual(
      expect.arrayContaining(["index", "myscript", "sub/script"]),
    );
    expect(registry.getFileKeys()).toHaveLength(3);
  });

  it("overwrites an existing module on add", () => {
    const registry = new ScenarioRegistry();

    registry.add("index", { foo() {} });
    registry.add("index", { bar() {} });

    const names = registry.getExportedFunctionNames("index");

    expect(names).toContain("bar");
    expect(names).not.toContain("foo");
  });
});
