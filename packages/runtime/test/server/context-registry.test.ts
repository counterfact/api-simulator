import {
  type Context,
  ContextRegistry,
  parentPath,
} from "../../src/server/context-registry.js";

describe("a context registry", () => {
  it("preserves live state when an unchanged initializer contains an own __proto__ data property", () => {
    const initial = () => ({
      state: Object.fromEntries([
        ["__proto__", { label: "data" }],
        ["count", 0],
      ]),
    });
    const registry = new ContextRegistry();
    const context = initial();
    registry.update("/special", context);
    const state = context.state;
    state.count = 7;
    registry.update("/special", initial());
    expect(registry.find("/special")).toBe(context);
    expect(context.state).toBe(state);
    expect(context.state.count).toBe(7);
    expect(Object.hasOwn(context.state, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(context.state)).toBe(Object.prototype);
  });

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

it("replaces reconstructed nested class instances rather than migrating their methods", () => {
  const declaration = () => {
    class Cart {
      public items: string[] = [];
      public total = () => this.items.length;
    }
    return { cart: new Cart(), action: () => "current" };
  };
  const registry = new ContextRegistry();
  const first = declaration();
  registry.update("/", first);
  const cart = first.cart;
  const action = first.action;
  cart.items.push("saved");
  const next = declaration();
  registry.update("/", next);
  expect(registry.find("/").cart).toBe(next.cart);
  expect(next.cart.total()).toBe(0);
  expect(cart.total()).toBe(1);
  expect(registry.find("/").action).not.toBe(action);
});

it("replaces class instances even when only private state changes", () => {
  class Cart {
    #currency: string;
    public constructor(currency: string) {
      this.#currency = currency;
    }
    public currency() {
      return this.#currency;
    }
  }
  const registry = new ContextRegistry();
  registry.update("/", { cart: new Cart("USD") });
  const cart = new Cart("EUR");
  registry.update("/", { cart });
  expect(registry.find("/").cart).toBe(cart);
  expect(cart.currency()).toBe("EUR");
});

it("replaces containers holding newly constructed class instances", () => {
  const declaration = () => {
    class Cart {
      public items: string[] = [];
      public self: Cart = this;
    }
    const cart = new Cart();
    return {
      graph: {
        array: [cart],
        map: new Map([[cart, cart]]),
        set: new Set([cart]),
      },
    };
  };
  const registry = new ContextRegistry();
  const first = declaration();
  registry.update("/", first);
  const graph = first.graph;
  graph.array[0]!.items.push("saved");
  const next = declaration();
  registry.update("/", next);
  expect(registry.find("/").graph).toBe(next.graph);
  expect(graph.array[0]!.items).toEqual(["saved"]);
});

it("still applies changed class initializer data, class types and declarations", () => {
  class Cart {
    public constructor(public currency: string) {}
  }
  class OtherCart {
    public constructor(public currency: string) {}
  }
  const registry = new ContextRegistry();
  registry.update("/", { cart: new Cart("USD") });
  const changed = new Cart("EUR");
  registry.update("/", { cart: changed });
  expect(registry.find("/").cart).toBe(changed);
  const other = new OtherCart("EUR");
  registry.update("/", { cart: other });
  expect(registry.find("/").cart).toBe(other);
  const plain = { currency: "EUR" };
  registry.update("/", { cart: plain });
  expect(registry.find("/").cart).toBe(plain);
});

it("keeps plain callbacks and bound class callables identity-sensitive", () => {
  const registry = new ContextRegistry();
  class Cart {
    public callback: () => number;
    public constructor(value: number) {
      this.callback = (() => value).bind(this);
    }
  }
  const callback = () => 1;
  registry.update("/", { cart: new Cart(1), plain: { callback } });
  const updated = { cart: new Cart(2), plain: { callback: () => 2 } };
  registry.update("/", updated);
  expect(registry.find("/").cart).toBe(updated.cart);
  expect(registry.find("/").plain).toBe(updated.plain);
});

it("compares symbols and decorated native/array declarations without losing own keys", () => {
  const key = Symbol("declaration");
  const declaration = (value: number) => {
    const data = Object.create(null) as Record<string | symbol, unknown>;
    Object.defineProperty(data, "__proto__", { enumerable: true, value });
    data[key] = value;
    return {
      data,
      array: Object.assign([1], { extra: value }),
      map: Object.assign(new Map([["key", 1]]), { extra: value }),
      date: Object.assign(new Date(0), { extra: value }),
    };
  };
  const registry = new ContextRegistry();
  registry.update("/", declaration(1));
  const changed = declaration(2);
  registry.update("/", changed);
  expect(registry.find("/").data).toBe(changed.data);
  expect(registry.find("/").array).toBe(changed.array);
  expect(registry.find("/").map).toBe(changed.map);
  expect(registry.find("/").date).toBe(changed.date);
  registry.update("/", declaration(2));
  expect(registry.find("/").data).toBe(changed.data);
});

it("treats custom prototypes and native subclasses as identity-sensitive", () => {
  const prototype = { inherited: true };
  const create = () => {
    class Values extends Uint8Array {}
    const opaque = Object.assign(Object.create(prototype), { count: 0 });
    return { opaque, values: new Values([1, 2]) };
  };
  const registry = new ContextRegistry();
  const first = create();
  registry.update("/", first);
  const { opaque, values } = first;
  opaque.count = 7;
  values[0] = 9;
  const next = create();
  registry.update("/", next);
  expect(registry.find("/").opaque).toBe(next.opaque);
  expect(registry.find("/").values).toBe(next.values);
});

it.each([
  ["Error", () => new Error("one"), () => new Error("two")],
  ["boxed primitive", () => Object(1), () => Object(2)],
  ["Promise", () => Promise.resolve(1), () => Promise.resolve(2)],
  ["WeakMap", () => new WeakMap(), () => new WeakMap()],
])(
  "keeps opaque %s initializer identity instead of discarding internal slots",
  (_name, firstValue, nextValue) => {
    const registry = new ContextRegistry();
    const first = firstValue();
    registry.update("/", { value: first });
    registry.update("/", { value: first });
    expect(registry.find("/").value).toBe(first);
    const next = nextValue();
    registry.update("/", { value: next });
    expect(registry.find("/").value).toBe(next);
  },
);

it("detects a changed native superclass with otherwise identical class source", () => {
  const create = (Base: typeof Error) => {
    class Value extends Base {}
    return new Value("message");
  };
  const registry = new ContextRegistry();
  registry.update("/", { value: create(Error) });
  const next = create(TypeError);
  registry.update("/", { value: next });
  expect(registry.find("/").value).toBe(next);
});

it("replaces reconstructed class-owned callables without inspecting their source", () => {
  class Cart {
    public callback;
    public constructor(value: number) {
      this.callback = Object.assign(() => "same", { data: value });
      Object.defineProperty(this.callback, "self", {
        enumerable: true,
        value: this.callback,
      });
    }
  }
  const registry = new ContextRegistry();
  const first = new Cart(1);
  registry.update("/", { cart: first });
  const unchangedSource = new Cart(1);
  registry.update("/", { cart: unchangedSource });
  expect(registry.find("/").cart).toBe(unchangedSource);
  const next = new Cart(2);
  registry.update("/", { cart: next });
  expect(registry.find("/").cart).toBe(next);
});

it("applies inherited enumerable context initializer changes after live overrides", () => {
  const create = (value: number) => {
    class InheritedContext {
      [key: string]: unknown;
    }
    Object.defineProperty(InheritedContext.prototype, "value", {
      enumerable: true,
      writable: true,
      value,
    });
    return new InheritedContext();
  };
  const registry = new ContextRegistry();
  registry.update("/", create(1));
  registry.find("/").value = 99;
  registry.update("/", create(2));
  expect(registry.find("/").value).toBe(2);
});

it("preserves a reused class instance without inspecting function source", () => {
  const create = () => {
    class Cart {
      public items: string[] = [];
      public label = "[native code]";
      public describe = () => "[native code]";
    }
    return new Cart();
  };
  const registry = new ContextRegistry();
  const cart = create();
  registry.update("/", { cart });
  cart.items.push("saved");
  registry.update("/", { cart });
  expect(registry.find("/").cart).toBe(cart);
  expect(cart.items).toEqual(["saved"]);
});

it("replaces tagged user classes without invoking nonenumerable tag getters", () => {
  const create = () => {
    class Cart {
      public items: string[] = [];
      public [Symbol.toStringTag] = "Cart";
    }
    return new Cart();
  };
  const registry = new ContextRegistry();
  const cart = create();
  const plain = { value: 1 };
  Object.defineProperty(plain, Symbol.toStringTag, {
    get() {
      throw new Error("must not inspect tag");
    },
  });
  registry.update("/", { cart, plain });
  cart.items.push("saved");
  const next = create();
  registry.update("/", { cart: next, plain: { value: 1 } });
  expect(registry.find("/").cart).toBe(next);
  expect(cart.items).toEqual(["saved"]);
});

it("keeps class-owned and aliased plain callbacks identity-sensitive", () => {
  const create = (value: number) => {
    const callback = () => value;
    class Cart {
      public callback = callback;
      public items: string[] = [];
    }
    return { cart: new Cart(), action: callback, plain: { callback } };
  };
  const registry = new ContextRegistry();
  const first = create(1);
  const cart = first.cart;
  registry.update("/", first);
  cart.items.push("saved");
  const next = create(2);
  registry.update("/", next);
  expect(registry.find("/").cart).toBe(next.cart);
  expect(registry.find("/").action).toBe(next.action);
  expect((registry.find("/").plain as typeof next.plain).callback()).toBe(2);
});

it("does not drop hidden state of JavaScript-implemented Node globals", () => {
  const registry = new ContextRegistry();
  registry.update("/", { url: new URL("https://example.com/one") });
  const url = new URL("https://example.com/two");
  registry.update("/", { url });
  expect(registry.find("/").url).toBe(url);
});

it("refreshes hidden queuing-strategy state", () => {
  for (const Strategy of [CountQueuingStrategy, ByteLengthQueuingStrategy]) {
    const registry = new ContextRegistry();
    registry.add("/", { value: new Strategy({ highWaterMark: 1 }) });
    registry.update("/", { value: new Strategy({ highWaterMark: 2 }) });
    expect((registry.find("/").value as QueuingStrategy).highWaterMark).toBe(2);
  }
});
