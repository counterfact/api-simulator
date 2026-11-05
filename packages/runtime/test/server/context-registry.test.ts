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
