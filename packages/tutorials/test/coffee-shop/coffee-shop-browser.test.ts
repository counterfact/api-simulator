import vm from "node:vm";
import { expect, it } from "@jest/globals";
import { coffeeShopPage } from "../../src/coffee-shop/coffee-shop-page.js";
import type { EditEvent } from "../../src/coffee-shop/coffee-shop-workspace.js";
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
    workspace?: boolean;
    prepared?: string[];
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
    replSubmissions: [] as { id: string; command: string }[],
    workspace: {
      enabled: !!options.workspace,
      prepared: options.prepared ?? [],
      checkpoints: [] as number[],
      changes: [] as EditEvent[],
    },
    checkpointError: false,
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
          workspace: structuredClone(server.workspace),
          sessionId: server.sessionId,
          revision: server.revision,
          state: structuredClone(server.state),
          replSubmissions: structuredClone(server.replSubmissions),
        };
      else if (path === "/tutorial-workspace") {
        if (body?.action === "prepare")
          server.workspace.prepared.push(String(body.phaseId));
        value = {
          ok: !server.checkpointError,
          message: server.checkpointError
            ? "Progress storage is temporarily unavailable"
            : "Saved progress",
        };
      } else if (path === "/tutorial-check")
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
      return {
        status,
        ok: status < 400,
        json: async () => value,
        headers: new Map([["content-type", "application/json"]]),
        text: async () =>
          path === "/orders" && server.orderMode === "malformed"
            ? "{broken JSON"
            : JSON.stringify(value),
      };
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

it("retains submitted REPL commands once and orders them before a following shop action", async () => {
  const app = await browser({ phase: "decaf" });
  app.server.replSubmissions.push({
    id: "one",
    command: 'context.inventory["decaf"] = 5',
  });
  await app.click("refresh-products");
  app.server.replSubmissions.push(
    { id: "two", command: ".scenario reset" },
    { id: "three", command: ".scenario reset" },
  );
  await app.poll();
  await app.poll();
  const transcript = app.root("lesson").textContent;
  expect(transcript.indexOf('context.inventory["decaf"] = 5')).toBeLessThan(
    transcript.indexOf("Refreshed products"),
  );
  expect(transcript.match(/Submitted in the REPL/g)).toHaveLength(3);
  const turns = JSON.parse(app.storage.get("counterfact-coffee-v2")!).turns as {
    command?: string;
  }[];
  expect(
    turns.filter((turn) => turn.command === ".scenario reset"),
  ).toHaveLength(2);
  expect(app.completed()).not.toContain("decaf");
  const reloaded = await browser({ storage: app.storage });
  reloaded.server.replSubmissions.push(...app.server.replSubmissions);
  await reloaded.poll();
  expect(
    reloaded.root("lesson").textContent.match(/Submitted in the REPL/g),
  ).toHaveLength(3);
});

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

it("keeps earlier turns visible and reveals the next lesson only after the learner replies", async () => {
  const app = await browser();
  expect(app.root("lesson").textContent).toContain("Hi, I’m Milo.");
  expect(app.root("lesson").textContent).not.toContain(
    "Replace random products",
  );
  await app.click("refresh-products");
  await app.click("continue");
  expect(app.root("lesson").textContent).toContain(
    "Explore your generated API",
  );
  expect(app.root("lesson").textContent).toContain("I’m ready. What’s next?");
  expect(app.root("lesson").textContent).toContain("Replace random products");
  const history = app.root("lesson").textContent;
  expect(history.indexOf("Inspect the generated stub")).toBeLessThan(
    history.indexOf("That worked."),
  );
  expect(history.match(/show the diff here/g)).toHaveLength(1);
  const restored = await browser({ storage: app.storage });
  expect(restored.root("lesson").textContent).toContain(
    "I’m ready. What’s next?",
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
  expect(app.root("lesson").textContent).toContain(
    "Restored the original failed cart: 1 × House Blend.",
  );
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
  expect(app.root("lesson").textContent).not.toContain("replace only its TODO");
  app.add("dark-roast");
  await app.api.placeOrder();
  expect(app.root("inventory-question").textContent).toContain("3 → 3");
  await app.answer("Yes, stock decreased");
  expect(app.root("inventory-question").textContent).toContain(
    "separate operations",
  );
  expect(app.root("lesson").textContent).not.toContain("replace only its TODO");
  const restored = await browser({ storage: app.storage });
  expect(restored.root("inventory-question").textContent).toContain("3 → 3");
  expect(restored.root("lesson").textContent).toContain(
    "A confirmation does not change context",
  );
  await restored.answer("Try again");
  await restored.answer("No, stock stayed the same");
  expect(restored.root("lesson").textContent).toContain(
    "replace only its TODO",
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

it("only prepares attended lessons, retains preparation on reload, and retries failed progress saves", async () => {
  const app = await browser({ phase: "catalog", workspace: true });
  const prepare = find(
    app.root("lesson"),
    (element) =>
      element.tag === "button" &&
      element.textContent === "Yes, make these edits",
  )!;
  expect(
    app.calls.filter((call) => call.path === "/tutorial-workspace"),
  ).toEqual([]);
  await prepare.onclick!();
  expect(app.server.workspace.prepared).toEqual(["catalog"]);
  expect(app.root("lesson").textContent).toContain(
    "I’ve added the supporting code",
  );
  expect(
    find(
      app.root("lesson"),
      (element) =>
        element.tag === "button" &&
        element.textContent === "Yes, make these edits",
    ),
  ).toBeUndefined();
  expect(
    app.calls.filter((call) => call.path === "/tutorial-workspace"),
  ).toHaveLength(1);
  const restored = await browser({
    storage: app.storage,
    workspace: true,
    prepared: ["catalog"],
  });
  expect(restored.root("lesson").textContent).toContain(
    "Yes, make these edits.",
  );
  expect(restored.root("lesson").textContent).toContain(
    "I’ve added the supporting code",
  );
  expect(restored.root("lesson").textContent).toContain(
    "May I make these supporting edits?",
  );
  const order = await browser({
    phase: "order",
    workspace: true,
    checkOk: true,
  });
  order.server.checkpointError = true;
  order.add();
  await order.api.placeOrder();
  await new Promise((resolve) => setImmediate(resolve));
  expect(order.completed()).not.toContain("order");
  expect(order.root("guide-status").textContent).toContain(
    "Progress storage is temporarily unavailable",
  );
  const retry = find(
    order.root("lesson"),
    (element) =>
      element.tag === "button" &&
      element.textContent === "Retry saving progress",
  )!;
  order.server.checkpointError = false;
  await retry.onclick!();
  expect(order.completed()).toContain("order");
});

it("retains the preparation explanation when failure progresses to recovery", async () => {
  const app = await browser({ phase: "fail", workspace: true, checkOk: true });
  const prepare = find(
    app.root("lesson"),
    (element) =>
      element.tag === "button" &&
      element.textContent === "Yes, make these edits",
  )!;
  await prepare.onclick!();
  const explanation = PHASES.find((phase) => phase.id === "fail")!.preparation!;
  app.server.orderMode = "unavailable";
  app.add();
  await app.api.placeOrder();
  await new Promise((resolve) => setImmediate(resolve));
  expect(app.root("lesson").textContent).toContain(explanation);
  expect(app.root("lesson").textContent).toContain(
    "Change ordersAvailable to true",
  );
});

it("shows attributed diffs for Milo and learner edits once, and retains them across reloads", async () => {
  const app = await browser({ phase: "catalog", workspace: true });
  const milo: EditEvent = {
    id: 1,
    actor: "milo",
    phaseId: "catalog",
    files: [
      {
        file: "routes/products.ts",
        before:
          "const catalog = [];\nreturn $.response.status(200).random();\n",
        after:
          "const catalog = [1];\nreturn $.response.status(200).random();\n",
      },
    ],
  };
  // Polling brings in an approved supporting edit recorded by the server.
  app.server.workspace.prepared.push("catalog");
  app.server.workspace.changes.push(milo);
  await app.poll();
  expect(app.root("lesson").textContent).toContain(
    "Here are the edits I made.",
  );
  expect(app.root("lesson").textContent).toContain("- const catalog = [];");
  expect(app.root("lesson").textContent).toContain("+ const catalog = [1];");
  app.server.workspace.changes.push({
    id: 2,
    actor: "you",
    files: [
      {
        file: "routes/products.ts",
        before: "return $.response.status(200).random();",
        after: "return $.response.status(200).json(catalog);",
      },
    ],
  });
  await app.poll();
  expect(app.root("lesson").textContent).toContain("Your saved changes");
  expect(app.root("lesson").textContent).toContain(
    "- return $.response.status(200).random();",
  );
  expect(app.root("lesson").textContent).toContain(
    "+ return $.response.status(200).json(catalog);",
  );
  await app.poll();
  expect(
    app.root("lesson").textContent.match(/Your saved changes/g),
  ).toHaveLength(1);
  const reloaded = await browser({
    storage: app.storage,
    workspace: true,
    prepared: ["catalog"],
  });
  expect(reloaded.root("lesson").textContent).toContain(
    "+ return $.response.status(200).json(catalog);",
  );
  expect(reloaded.root("lesson").textContent).toContain(
    "Here are the edits I made.",
  );
});

it("records cart actions with quantities and retains them after reload", async () => {
  const app = await browser({ phase: "order" });
  app.add();
  find(
    app.root("cart"),
    (element) => element.tag === "button" && element.textContent === "+",
  )!.onclick!();
  find(
    app.root("cart"),
    (element) => element.tag === "button" && element.textContent === "−",
  )!.onclick!();
  find(
    app.root("cart"),
    (element) => element.tag === "button" && element.textContent === "Remove",
  )!.onclick!();
  app.add("dark-roast");
  await app.click("empty-cart");
  const history = app.root("lesson").textContent;
  expect(history).toContain("Added House Blend to the cart (quantity: 1).");
  expect(history).toContain("Changed House Blend in the cart from 1 to 2.");
  expect(history).toContain("Changed House Blend in the cart from 2 to 1.");
  expect(history).toContain("Removed House Blend from the cart (1 removed).");
  expect(history).toContain("Emptied the cart: 1 × Dark Roast.");
  const reloaded = await browser({ storage: app.storage });
  expect(reloaded.root("lesson").textContent).toContain(
    "Changed House Blend in the cart from 1 to 2.",
  );
  expect(reloaded.root("lesson").textContent).toContain(
    "Emptied the cart: 1 × Dark Roast.",
  );
});

it("records explicit refreshes and their outcomes without treating background requests as user actions", async () => {
  const app = await browser();
  expect(app.root("lesson").textContent).not.toContain("Refreshed products.");
  await app.click("refresh-products");
  expect(app.root("lesson").textContent).toContain(
    "GET /products returned HTTP 200 with 3 products.",
  );
  await app.poll();
  await app.poll();
  expect(
    app.root("lesson").textContent.match(/Refreshed products\./g),
  ).toHaveLength(1);
  app.server.productMode = "offline";
  await app.click("refresh-products");
  expect(app.root("lesson").textContent).toContain(
    "The product refresh failed:",
  );
});

it("records order contents, failure, retry, and the actual response in chronological order", async () => {
  const app = await browser({ phase: "order" });
  app.server.orderMode = "unavailable";
  app.add();
  await app.api.placeOrder();
  app.server.orderMode = "echo";
  await app.api.placeOrder();
  const history = app.root("lesson").textContent;
  const placed = history.indexOf("Placed an order: 1 × House Blend.");
  const failed = history.indexOf("POST /orders returned HTTP 503");
  const retried = history.indexOf("Retried the order: 1 × House Blend.");
  const succeeded = history.indexOf(
    "POST /orders returned HTTP 201 with order ID 1.",
  );
  expect(placed).toBeGreaterThan(-1);
  expect(placed).toBeLessThan(failed);
  expect(failed).toBeLessThan(retried);
  expect(retried).toBeLessThan(succeeded);
  expect(history).not.toContain("Refreshed products.");
  const reloaded = await browser({ storage: app.storage });
  expect(
    reloaded
      .root("lesson")
      .textContent.match(/POST \/orders returned HTTP 503/g),
  ).toHaveLength(1);
  expect(
    reloaded.root("lesson").textContent.match(/Retried the order:/g),
  ).toHaveLength(1);
});

it("attaches collapsed HTTP exchanges and handler links to their own action turns", async () => {
  const app = await browser({ phase: "order" });
  await app.click("refresh-products");
  const first = find(
    app.root("lesson"),
    (element) =>
      element.tag === "details" && element.className === "http-exchange",
  )!;
  expect(first.open).toBe(false);
  expect(
    find(first, (element) => element.className === "http-headers")!.open,
  ).toBe(false);
  expect(first.textContent).toContain("GET http://localhost:3100/products");
  expect(find(first, (element) => element.tag === "a")!.href).toContain(
    "/routes/products.ts",
  );
  first.open = true;
  app.add();
  expect(
    find(
      app.root("lesson"),
      (element) =>
        element.tag === "details" && element.className === "http-exchange",
    )!.open,
  ).toBe(true);
  app.server.orderMode = "unavailable";
  await app.api.placeOrder();
  app.server.orderMode = "echo";
  await app.api.placeOrder();
  const transcript = JSON.parse(
    app.storage.get("counterfact-coffee-v2")!,
  ).turns;
  const failed = transcript.find((turn: { text: string }) =>
    turn.text.startsWith("Placed an order:"),
  );
  const retry = transcript.find((turn: { text: string }) =>
    turn.text.startsWith("Retried the order:"),
  );
  expect(failed.exchanges).toHaveLength(2);
  expect(failed.exchanges[0]).toMatchObject({
    method: "POST",
    handler: "routes/orders.ts",
    status: 503,
    requestBody: { items: [{ productId: "house-blend", quantity: 1 }] },
    responseBody: { error: "Ordering is temporarily unavailable." },
  });
  expect(failed.exchanges[1]).toMatchObject({
    method: "GET",
    handler: "routes/products.ts",
    status: 200,
  });
  expect(retry.exchanges[0]).toMatchObject({
    status: 201,
    responseBody: { orderId: 1 },
  });
  const reloaded = await browser({ storage: app.storage });
  expect(reloaded.root("lesson").textContent).toContain(
    "HTTP · POST /orders → 503",
  );
  expect(reloaded.root("lesson").textContent).toContain(
    "HTTP · POST /orders → 201",
  );
});

it("retains malformed and missing responses without inventing an HTTP result", async () => {
  const app = await browser({ phase: "order" });
  app.server.orderMode = "malformed";
  app.add();
  await app.api.placeOrder();
  const malformed = JSON.parse(
    app.storage.get("counterfact-coffee-v2")!,
  ).turns.find((turn: { exchanges?: unknown }) => turn.exchanges);
  expect(malformed.exchanges[0]).toMatchObject({
    status: 201,
    responseText: "{broken JSON",
    error: expect.stringContaining("not valid JSON"),
  });
  app.server.orderMode = "offline";
  await app.api.placeOrder();
  const attempts = JSON.parse(
    app.storage.get("counterfact-coffee-v2")!,
  ).turns.filter((turn: { exchanges?: unknown }) => turn.exchanges);
  expect(attempts[1].exchanges[0].status).toBeUndefined();
  expect(attempts[1].exchanges[0].error).toContain("No confirmation");
  expect(app.root("lesson").textContent).toContain(
    "No HTTP response was recorded",
  );
});

it("keeps each refresh snapshot immutable and marks an interrupted exchange on reload", async () => {
  const app = await browser({ phase: "order" });
  await app.click("refresh-products");
  app.server.products[0]!.stock = 2;
  await app.click("refresh-products");
  const saved = JSON.parse(app.storage.get("counterfact-coffee-v2")!);
  const refreshes = saved.turns.filter(
    (turn: { text: string }) => turn.text === "Refreshed products.",
  );
  expect(refreshes[0].exchanges[0].responseBody[0].stock).toBe(5);
  expect(refreshes[1].exchanges[0].responseBody[0].stock).toBe(2);
  refreshes[1].exchanges[0].pending = true;
  delete refreshes[1].exchanges[0].status;
  delete refreshes[1].exchanges[0].responseBody;
  delete refreshes[1].exchanges[0].responseText;
  app.storage.set("counterfact-coffee-v2", JSON.stringify(saved));
  const reloaded = await browser({ storage: app.storage });
  expect(reloaded.root("lesson").textContent).toContain(
    "The page reloaded before a response was recorded",
  );
  expect(reloaded.root("lesson").textContent).toContain(
    "HTTP · GET /products → no response",
  );
  expect(
    reloaded.calls.filter((call) => call.path === "/products"),
  ).toHaveLength(1);
});
