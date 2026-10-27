import vm from "node:vm";
import { expect, it } from "@jest/globals";
import { coffeeShopPage } from "../../src/coffee-shop/coffee-shop-page.js";
import { CATALOG, PHASES } from "../../src/coffee-shop/coffee-shop-lessons.js";

class Element {
  id = "";
  href = "";
  className = "";
  disabled = false;
  hidden = false;
  open = false;
  dataset: Record<string, string> = {};
  children: Element[] = [];
  onclick: (() => unknown) | undefined;
  private text = "";
  constructor(readonly tag: string) {}
  set textContent(value: string) {
    this.text = value;
    this.children = [];
  }
  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join("");
  }
  append(...children: Element[]) {
    this.children.push(...children);
  }
  replaceChildren(...children: Element[]) {
    this.text = "";
    this.children = children;
  }
  setAttribute(name: string, value: string) {
    if (name === "id") this.id = value;
  }
  querySelectorAll() {
    const result: Element[] = [];
    const visit = (current: Element) => {
      if (current.tag === "details" && current.open) result.push(current);
      current.children.forEach(visit);
    };
    this.children.forEach(visit);
    return result;
  }
}
function find(
  node: Element,
  predicate: (element: Element) => boolean,
): Element | undefined {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return undefined;
}
async function browser(
  options: {
    phase?: string;
    preview?: boolean;
    storage?: Map<string, string>;
    origin?: string;
    deduct?: boolean;
    products?: typeof CATALOG;
    checkOk?: boolean;
    observation?: { before: number; after: number; quantity: number };
    entryState?: unknown;
    sessionId?: string;
  } = {},
) {
  const storage = options.storage ?? new Map<string, string>();
  const phaseIndex = PHASES.findIndex(
    (phase) => phase.id === (options.phase ?? "explore"),
  );
  const productData = structuredClone(options.products ?? CATALOG);
  const server = {
    revision: "initial",
    sessionId: options.sessionId ?? "same-session",
    checkOk: options.checkOk ?? false,
    deduct: options.deduct ?? false,
    orderMode: "echo",
    productMode: "valid",
    products: productData,
    state: {
      catalog: null as unknown,
      inventory: null as Record<string, number> | null,
    },
    nextId: 1,
  };
  if (options.phase)
    storage.set(
      "counterfact-coffee-v2",
      JSON.stringify({
        version: 2,
        sessionId: server.sessionId,
        index: phaseIndex,
        completed: options.preview
          ? []
          : PHASES.slice(0, phaseIndex).map((phase) => phase.id),
        cart: [],
        observation: options.observation,
        entryState: options.entryState,
      }),
    );
  const page = coffeeShopPage("/tmp/coffee shop#1?");
  const roots = [...page.split("<script>")[0]!.matchAll(/id="([^"]+)"/gu)].map(
    (match) => {
      const element = new Element("div");
      element.id = match[1]!;
      return element;
    },
  );
  const root = (id: string) =>
    roots
      .map((element) => find(element, (candidate) => candidate.id === id))
      .find(Boolean)!;
  const calls: { path: string; body?: Record<string, unknown> }[] = [];
  let poll: (() => unknown) | undefined;
  const context = vm.createContext({
    document: {
      hidden: false,
      createElement: (tag: string) => new Element(tag),
      getElementById: root,
    },
    window: {
      location: {
        origin: options.origin ?? "http://localhost:3100",
        port: new URL(options.origin ?? "http://localhost:3100").port,
      },
    },
    navigator: {},
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    setInterval: (callback: () => unknown) => {
      poll = callback;
      return 1;
    },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    fetch: async (path: string, request: { body?: string } = {}) => {
      const body = request.body
        ? (JSON.parse(request.body) as Record<string, unknown>)
        : undefined;
      calls.push({ path, body });
      let status = 200,
        value: unknown;
      if (path === "/tutorial-info")
        value = {
          sessionId: server.sessionId,
          revision: server.revision,
          state: structuredClone(server.state),
        };
      else if (path === "/tutorial-check")
        value = {
          revision: server.revision,
          ok: server.checkOk,
          message: server.checkOk
            ? "Saved implementation verified."
            : "Expected an explicit implementation.",
        };
      else if (path === "/tutorial-event") value = { ok: true };
      else if (path === "/products") {
        if (server.productMode === "offline")
          throw new Error("Disconnected. Click Refresh products to retry.");
        value =
          server.productMode === "invalid"
            ? [{ id: "missing-fields" }]
            : structuredClone(server.products);
      } else {
        if (server.orderMode === "offline")
          throw new Error("No confirmation; inspect the API before retrying.");
        const items = body!.items as { productId: string; quantity: number }[];
        status =
          server.orderMode === "unavailable"
            ? 503
            : server.orderMode === "shortage"
              ? 409
              : 201;
        value =
          status === 201
            ? {
                orderId: server.nextId++,
                items: server.orderMode === "random" ? [] : items,
              }
            : status === 409
              ? {
                  error: "Not enough stock",
                  shortages: [
                    { productId: "dark-roast", requested: 2, available: 1 },
                  ],
                }
              : { error: "Ordering is temporarily unavailable." };
        if (status === 201 && server.deduct)
          for (const item of items)
            server.products.find(
              (product) => product.id === item.productId,
            )!.stock -= item.quantity;
      }
      return { status, ok: status < 400, json: async () => value };
    },
  });
  vm.runInContext(page.split("<script>")[1]!.split("</script>")[0]!, context);
  const api = (await vm.runInContext("walkthroughReady", context)) as {
    placeOrder: () => Promise<void>;
    checkFiles: (force?: boolean) => Promise<void>;
  };
  const click = async (id: string) => {
    await root(id).onclick!();
  };
  return {
    root,
    server,
    calls,
    storage,
    click,
    api,
    async poll() {
      await poll!();
      await new Promise((resolve) => setImmediate(resolve));
    },
    add(id = "house-blend") {
      const card = find(
        root("products"),
        (element) => element.dataset.productId === id,
      )!;
      find(
        card,
        (element) =>
          element.tag === "button" && element.textContent === "Add to cart",
      )!.onclick!();
    },
    async answer(label: string) {
      await find(
        root("inventory-question"),
        (element) => element.tag === "button" && element.textContent === label,
      )!.onclick!();
    },
    completed() {
      return (
        JSON.parse(storage.get("counterfact-coffee-v2")!) as {
          completed: string[];
        }
      ).completed;
    },
  };
}

it.each(["http://localhost:3100", "http://localhost:4123"])(
  "links the opening explanation to the actual API at %s",
  async (origin) => {
    const app = await browser({ origin });
    expect(
      find(
        app.root("lesson"),
        (element) => element.tag === "a" && element.textContent === origin,
      )?.href,
    ).toBe(origin);
    expect(app.root("lesson").textContent).toContain(
      "your local API, which is running at",
    );
  },
);

it("renders arbitrary product IDs safely and refreshes only on explicit actions", async () => {
  const app = await browser({
    products: [
      {
        id: "__proto__",
        name: "Random coffee",
        description: "Generated",
        price: 700,
        stock: 2,
      },
    ],
  });
  app.add("__proto__");
  expect(app.root("cart").textContent).toContain("Random coffee × 1");
  await app.poll();
  await app.poll();
  expect(app.calls.filter((call) => call.path === "/products")).toHaveLength(1);
  app.server.products[0]!.name = "Another response";
  await app.click("refresh-products");
  expect(app.root("cart").textContent).toContain("empty");
  expect(app.root("guide-status").textContent).toContain(
    "clears the previous cart",
  );
  expect(app.root("products").textContent).toContain("Another response");
  expect(app.completed()).toContain("explore");
  expect(app.root("request-trace").textContent).toContain(
    "http://localhost:3100/products",
  );
});

it("rejects duplicate IDs with a useful explanation and recovers on refresh", async () => {
  const app = await browser({ products: [CATALOG[0]!, CATALOG[0]!] });
  expect(app.root("guide-status").textContent).toContain("duplicate IDs");
  app.server.products = structuredClone(CATALOG);
  await app.click("refresh-products");
  expect(app.root("products").textContent).toContain("Dark Roast");
});

it("does not credit a random confirmation or a catalog before a passing saved check", async () => {
  const app = await browser({ phase: "catalog" });
  await app.click("refresh-products");
  await app.click("refresh-products");
  expect(app.completed()).not.toContain("catalog");
  app.server.checkOk = true;
  app.server.revision = "catalog-edit";
  await app.click("refresh-products");
  await app.click("refresh-products");
  expect(app.completed()).toContain("catalog");
  await app.click("continue");
  app.server.orderMode = "random";
  app.add();
  await app.api.placeOrder();
  expect(app.completed()).not.toContain("order");
  app.server.orderMode = "echo";
  app.add();
  await app.api.placeOrder();
  expect(app.completed()).toContain("order");
  expect(app.root("request-trace").textContent).toContain('"request"');
});

it("previews later lessons without applying edits or crediting completion", async () => {
  const app = await browser();
  await app.click("skip");
  expect(app.root("lesson").textContent).toContain("Preview: complete");
  app.server.checkOk = true;
  await app.click("refresh-products");
  await app.click("refresh-products");
  expect(app.completed()).toEqual([]);
  expect(
    app.calls.every((call) =>
      [
        "/tutorial-info",
        "/tutorial-check",
        "/tutorial-event",
        "/products",
      ].includes(call.path),
    ),
  ).toBe(true);
  find(
    app.root("lesson"),
    (element) =>
      element.tag === "button" &&
      element.textContent === "Return to required edit",
  )!.onclick!();
  expect(app.root("lesson").textContent).toContain(
    "Explore your generated API",
  );
});

it("does not reveal the recovery edit before the observed failure, then retries the original cart", async () => {
  const app = await browser({ phase: "fail", checkOk: true });
  expect(app.root("lesson").textContent).not.toContain(
    "Change ordersAvailable to true",
  );
  app.server.orderMode = "unavailable";
  app.add();
  await app.api.placeOrder();
  expect(app.root("lesson").textContent).toContain(
    "Change ordersAvailable to true",
  );
  expect(app.root("cart").textContent).toContain("House Blend × 1");
  app.add();
  expect(app.root("retry-recovery").textContent).toContain(
    "Restore original cart",
  );
  find(app.root("retry-recovery"), (element) => element.tag === "button")!
    .onclick!();
  app.server.orderMode = "echo";
  app.server.revision = "retry-edit";
  await app.api.checkFiles();
  await app.api.placeOrder();
  expect(app.completed()).toContain("retry");
});

it("waits for an explicit seed command instead of completing from a saved scenario alone", async () => {
  const app = await browser({
    phase: "seed",
    checkOk: true,
    entryState: { catalog: [], inventory: {} },
  });
  await app.click("check-progress");
  expect(app.completed()).not.toContain("seed");
  app.server.state = {
    catalog: CATALOG.map(({ stock: _stock, ...product }) => product),
    inventory: { "house-blend": 5, "dark-roast": 3, decaf: 0 },
  };
  await app.click("check-progress");
  expect(app.completed()).toContain("seed");
});

it("keeps the inventory edit hidden through a wrong answer and reload, then reveals it after retry", async () => {
  const app = await browser({ phase: "observe" });
  expect(app.root("lesson").textContent).not.toContain(
    "Replace routes/orders.ts",
  );
  app.add("dark-roast");
  await app.api.placeOrder();
  expect(app.root("inventory-question").textContent).toContain("3 → 3");
  await app.answer("Yes, stock decreased");
  expect(app.root("inventory-question").textContent).toContain(
    "separate operations",
  );
  expect(app.root("lesson").textContent).not.toContain(
    "Replace routes/orders.ts",
  );
  const restored = await browser({ storage: app.storage });
  expect(restored.root("inventory-question").textContent).toContain("3 → 3");
  await restored.answer("Yes, stock decreased");
  await restored.answer("Try again");
  await restored.answer("No, stock stayed the same");
  expect(restored.root("lesson").textContent).toContain(
    "Replace routes/orders.ts",
  );
  expect(restored.root("lesson").textContent).toContain(
    "inventory[item.productId] -= item.quantity",
  );
  expect(restored.completed()).toContain("observe");
});

it("checks the quiz against the actual reduction in a retained implementation", async () => {
  const app = await browser({ phase: "observe", deduct: true });
  app.add("dark-roast");
  await app.api.placeOrder();
  await app.answer("No, stock stayed the same");
  expect(app.root("inventory-question").textContent).toContain(
    "already subtracts",
  );
  await app.answer("Try again");
  await app.answer("Yes, stock decreased");
  expect(app.completed()).toContain("observe");
});

it("credits inventory reduction only after a checked handler and a matching observed purchase", async () => {
  const app = await browser({ phase: "reduce", checkOk: true, deduct: true });
  app.add("dark-roast");
  await app.api.placeOrder();
  expect(app.completed()).toContain("reduce");
  expect(app.root("products").textContent).toContain("2 bags available");
});

it("keeps the cart on unknown confirmation and disables orders on stale product data", async () => {
  const app = await browser();
  app.add();
  app.server.orderMode = "offline";
  await app.api.placeOrder();
  expect(app.root("cart").textContent).toContain("House Blend × 1");
  app.server.productMode = "offline";
  await app.click("refresh-products");
  expect(app.root("checkout").disabled).toBe(true);
  app.server.productMode = "valid";
  await app.click("refresh-products");
  expect(app.root("checkout").disabled).toBe(true); // Random refresh explicitly cleared the old cart.
});

it("keeps code hints open across a save check and uses escaped editor links", async () => {
  const app = await browser({ phase: "catalog" });
  const hint = find(
    app.root("lesson"),
    (element) => element.tag === "details",
  )!;
  hint.open = true;
  expect(
    find(
      app.root("lesson"),
      (element) =>
        element.tag === "a" && element.textContent === "Open in VSCode",
    )!.href,
  ).toBe("vscode://file/tmp/coffee%20shop%231%3F/routes/products.ts");
  app.server.revision = "saved";
  await app.poll();
  expect(
    find(app.root("lesson"), (element) => element.tag === "details")!.open,
  ).toBe(true);
});

it("requires two observed sequential confirmations to connect the shared context", async () => {
  const app = await browser({ phase: "connect", checkOk: true });
  app.add();
  await app.api.placeOrder();
  expect(app.completed()).not.toContain("connect");
  app.add();
  await app.api.placeOrder();
  expect(app.completed()).toContain("connect");
});

it("waits for stock rejection, an emptied cart, and explicit restoration before the inventory lesson", async () => {
  const app = await browser({ phase: "rules", checkOk: true });
  app.add("dark-roast");
  app.add("dark-roast");
  app.server.products.find((product) => product.id === "dark-roast")!.stock = 1;
  await app.click("refresh-products");
  app.server.orderMode = "shortage";
  await app.api.placeOrder();
  expect(app.completed()).not.toContain("rules");
  expect(app.root("cart").textContent).toContain("Dark Roast × 2");
  await app.click("empty-cart");
  app.server.products.find((product) => product.id === "dark-roast")!.stock = 3;
  await app.click("refresh-products");
  expect(app.completed()).toContain("rules");
  expect(app.root("checkout").textContent).toBe("Place order");
});

it("does not complete the focused scenario until its live change preserves other inventory", async () => {
  const app = await browser({
    phase: "scenario",
    checkOk: true,
    origin: "http://localhost:4123",
    entryState: {
      catalog: [],
      inventory: { "dark-roast": 4, decaf: 5, "house-blend": 3 },
    },
  });
  await app.click("check-progress");
  expect(app.completed()).not.toContain("scenario");
  app.server.state.inventory = { "dark-roast": 5, decaf: 0, "house-blend": 3 };
  await app.click("check-progress");
  expect(app.completed()).not.toContain("scenario");
  app.server.state.inventory.decaf = 5;
  await app.click("check-progress");
  expect(app.completed()).toContain("scenario");
  expect(app.root("lesson").textContent).toContain("--port 4123");
  expect(app.root("lesson").textContent).toContain(
    "Restarting keeps your code",
  );
});

it("a newly saved invalid handler cannot earn progress through the previously checked implementation", async () => {
  const app = await browser({ phase: "order", checkOk: true });
  app.server.revision = "broken-edit";
  app.server.checkOk = false;
  app.add();
  await app.api.placeOrder();
  expect(app.completed()).not.toContain("order");
  expect(app.root("save-check").textContent).toContain(
    "Expected an explicit implementation",
  );
  app.server.revision = "repaired-edit";
  app.server.checkOk = true;
  app.add();
  await app.api.placeOrder();
  expect(app.completed()).toContain("order");
});

it("starts a new lesson session after a server restart without accepting old completion state", async () => {
  const app = await browser({
    phase: "observe",
    observation: { before: 3, after: 3, quantity: 1 },
  });
  const restarted = await browser({
    storage: app.storage,
    sessionId: "new-server-session",
  });
  expect(restarted.root("lesson").textContent).toContain(
    "Explore your generated API",
  );
  expect(restarted.completed()).toEqual([]);
});

it("uses the observed post-purchase stock when entering the reusable scenario lesson", async () => {
  const initialProducts = structuredClone(CATALOG);
  initialProducts.find((product) => product.id === "dark-roast")!.stock = 5;
  const app = await browser({
    phase: "restock",
    checkOk: true,
    deduct: true,
    products: initialProducts,
  });
  app.server.state = {
    catalog: [],
    inventory: { "house-blend": 5, "dark-roast": 5, decaf: 0 },
  };
  app.add("dark-roast");
  await app.api.placeOrder();
  expect(app.completed()).toContain("restock");
  await app.click("continue");
  // The information snapshot preceded the order; the product response observed 4.
  app.server.state.inventory!["dark-roast"] = 5;
  await app.click("check-progress");
  expect(app.completed()).toContain("scenario");
});

it("lets an already-restocked shop establish a new observable starting quantity", async () => {
  const app = await browser({
    phase: "scenario",
    checkOk: true,
    entryState: { catalog: [], inventory: { "dark-roast": 5, decaf: 0 } },
  });
  app.server.state.inventory = { "dark-roast": 4, decaf: 0 };
  await app.click("check-progress");
  expect(app.completed()).not.toContain("scenario");
  app.server.state.inventory["dark-roast"] = 5;
  await app.click("check-progress");
  expect(app.completed()).toContain("scenario");
});
