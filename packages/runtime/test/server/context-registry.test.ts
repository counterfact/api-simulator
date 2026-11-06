import {
  type Context,
  ContextRegistry,
  parentPath,
} from "../../src/server/context-registry.js";

describe("a context registry", () => {
  it("finds a context that exactly matches the path", () => {
    const helloContext = { name: "hello" };

    const registry = new ContextRegistry();

    registry.update("/hello", helloContext);

    expect(registry.find("/hello")).toBe(helloContext);
  });

  it("finds a context at a parent path", () => {
    const helloContext = { name: "hello" };

    const registry = new ContextRegistry();

    registry.add("/hello", helloContext);

    expect(registry.find("/hello/world")).toBe(helloContext);
  });

  it("finds a context at a parent path with alternate casing", () => {
    const helloContext = { name: "hello" };

    const registry = new ContextRegistry();

    registry.add("/hello", helloContext);

    expect(registry.find("/Hello/world")).toBe(helloContext);
  });

  it("returns an empty object when there is no matching context", () => {
    const helloContext = { name: "hello" };

    const registry = new ContextRegistry();

    registry.add("/hello", helloContext);

    expect(registry.find("/goodbye/world")).toStrictEqual({});
  });

  it("updates an existing context by changing methods but not properties", () => {
    class SingleContext implements Context {
      public count = 0;

      public increment() {
        this.count += 1;
      }

      [key: string]: unknown;
    }

    class DoubleContext implements Context {
      public count = 0;

      public increment() {
        this.count += 2;
      }

      [key: string]: unknown;
    }

    const originalContext = new SingleContext();

    const registry = new ContextRegistry();

    registry.update("/", originalContext);
    originalContext.increment();

    expect(registry.find("/").count).toBe(1);

    registry.update("/", new DoubleContext());

    expect(registry.find("/").count).toBe(1);

    originalContext.increment();

    expect(registry.find("/").count).toBe(3);
  });
});

it("updates context properties if they changed in the code", () => {
  class OriginalContext implements Context {
    public prop1 = "original";

    public prop2 = "original";

    public prop3 = "original";

    public prop4 = "original";

    [key: string]: unknown;
  }

  class UpdatedContext implements Context {
    public prop1 = "original";

    public prop2 = "changed in code";

    // deleted prop3

    public prop4 = "original";

    public prop5 = "new";

    [key: string]: unknown;
  }

  const registry = new ContextRegistry();

  registry.update("/", new OriginalContext());

  const context = registry.find("/");

  context.prop1 = "changed at runtime";

  registry.update("/", new UpdatedContext());

  expect({ ...context }).toEqual({
    prop1: "changed at runtime",
    prop2: "changed in code",
    prop3: "original",
    prop4: "original",
    prop5: "new",
  });
});

describe("parentPath()", () => {
  it("returns the parent path", () => {
    expect(parentPath("/hello/world")).toBe("/hello");
  });

  it("returns '/' when the path is at the root", () => {
    expect(parentPath("/hello")).toBe("/");
  });
});

it("preserves seeded inventory and live nested state across unchanged context reloads", () => {
  const registry = new ContextRegistry();
  const initial = {
    inventory: {},
    orders: [] as string[],
    settings: { nested: { enabled: true } },
  };
  registry.update("/", initial);
  const inventory = { "house-blend": 5, "dark-roast": 3, decaf: 0 };
  initial.inventory = inventory;
  inventory["house-blend"] -= 1;
  initial.orders.push("order-1");
  initial.settings.nested.enabled = false;

  for (let reload = 0; reload < 2; reload += 1) {
    registry.update("/", {
      inventory: {},
      orders: [],
      settings: { nested: { enabled: true } },
    });
    expect(registry.find("/").inventory).toBe(inventory);
    expect(registry.find("/").inventory).toEqual({
      "house-blend": 4,
      "dark-roast": 3,
      decaf: 0,
    });
    expect(registry.find("/").orders).toBe(initial.orders);
    expect(registry.find("/").settings).toBe(initial.settings);
  }
});

it("applies changed object initializers while preserving unrelated live state", () => {
  const registry = new ContextRegistry();
  registry.update("/", { inventory: {}, orders: [] });
  const context = registry.find("/");
  context.inventory = { "house-blend": 4 };
  context.orders = ["order-1"];
  registry.update("/", { inventory: { "house-blend": 10 }, orders: [] });
  expect(context.inventory).toEqual({ "house-blend": 10 });
  expect(context.orders).toEqual(["order-1"]);
});

it("preserves live Map and Set mutations until their declarations change", () => {
  const callback = () => "unchanged";
  const declaration = () => ({
    pets: new Map([[1, { name: "Original", callback }]]),
    labels: new Set(["original"]),
  });
  const registry = new ContextRegistry();
  const context = declaration();
  registry.update("/", context);
  context.pets.get(1)!.name = "Edited";
  context.pets.set(2, { name: "Added", callback });
  context.labels.add("live");
  registry.update("/", declaration());
  expect(registry.find("/").pets).toBe(context.pets);
  expect(context.pets.get(1)!.name).toBe("Edited");
  expect(context.pets.size).toBe(2);
  expect(context.labels).toEqual(new Set(["original", "live"]));
  registry.update("/", {
    pets: new Map([[3, { name: "New", callback }]]),
    labels: new Set(["new"]),
  });
  expect(context.pets).toEqual(new Map([[3, { name: "New", callback }]]));
  expect(context.labels).toEqual(new Set(["new"]));
});

it("compares cyclic initializer snapshots without aliasing live objects", () => {
  const declaration = () => {
    const root: Record<string, unknown> = { count: 0 };
    root.self = root;
    root.items = [root];
    root.map = new Map([["root", root]]);
    root.set = new Set([root]);
    return { root };
  };
  const registry = new ContextRegistry();
  const context = declaration();
  registry.update("/", context);
  context.root.count = 7;
  registry.update("/", declaration());
  expect(registry.find("/").root).toBe(context.root);
  expect(context.root.count).toBe(7);
});

it("preserves changed dates and binary state when native-value declarations are unchanged", () => {
  const declaration = () => ({
    date: new Date(0),
    pattern: /test/gu,
    buffer: Buffer.from([1]),
    bytes: new Uint8Array([2]),
    raw: new Uint8Array([3]).buffer,
  });
  const registry = new ContextRegistry();
  const context = declaration();
  registry.update("/", context);
  context.date.setTime(100);
  context.pattern.lastIndex = 2;
  context.buffer[0] = 4;
  context.bytes[0] = 5;
  new Uint8Array(context.raw)[0] = 6;
  registry.update("/", declaration());
  expect(context.date.getTime()).toBe(100);
  expect(context.pattern.lastIndex).toBe(2);
  expect(context.buffer[0]).toBe(4);
  expect(context.bytes[0]).toBe(5);
  expect(new Uint8Array(context.raw)[0]).toBe(6);
});

it("preserves live RegExp state until its pattern, flags, or initial cursor changes", () => {
  const declaration = () => {
    const pattern = /a\.b/giu;
    pattern.lastIndex = 2;
    return { pattern };
  };
  const registry = new ContextRegistry();
  const context = declaration();
  const livePattern = context.pattern;
  registry.update("/", context);
  livePattern.lastIndex = 7;

  for (let reload = 0; reload < 2; reload += 1) {
    registry.update("/", declaration());
    expect(context.pattern).toBe(livePattern);
    expect(context.pattern.lastIndex).toBe(7);
  }

  const changedCursor = declaration();
  changedCursor.pattern.lastIndex = 3;
  registry.update("/", changedCursor);
  expect(context.pattern).toBe(changedCursor.pattern);
  expect(context.pattern.lastIndex).toBe(3);

  const changedFlags = /a\.b/gu;
  changedFlags.lastIndex = 3;
  registry.update("/", { pattern: changedFlags });
  expect(context.pattern).toBe(changedFlags);

  const changedPattern = /c\.d/gu;
  changedPattern.lastIndex = 3;
  registry.update("/", { pattern: changedPattern });
  expect(context.pattern).toBe(changedPattern);
});

it("snapshots RegExp internals without reading overridden source or flags", () => {
  const registry = new ContextRegistry();
  const pattern = /a\.b/giu;
  pattern.lastIndex = 2;
  let metadataReads = 0;
  const readMetadata = () => {
    metadataReads += 1;
    throw new Error("RegExp metadata must not be evaluated while snapshotting");
  };
  Object.defineProperties(pattern, {
    source: { get: readMetadata },
    flags: { get: readMetadata },
  });
  const context = { pattern };
  registry.update("/", context);
  pattern.lastIndex = 7;

  const unchangedPattern = /a\.b/giu;
  unchangedPattern.lastIndex = 2;
  registry.update("/", { pattern: unchangedPattern });
  expect(context.pattern).toBe(pattern);
  expect(context.pattern.lastIndex).toBe(7);
  expect(metadataReads).toBe(0);
});
