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
