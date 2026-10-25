import vm from "node:vm";
import { expect, it } from "@jest/globals";
import { coffeeShopPage } from "../../src/coffee-shop/coffee-shop-page.js";

// A small DOM and controlled HTTP responses exercise the shipped browser script,
// including async refreshes. Real-browser layout is checked separately.
class Element {
  id = "";
  href = "";
  className = "";
  dataset: Record<string, string> = {};
  disabled = false;
  hidden = false;
  children: Element[] = [];
  parent: Element | undefined;
  onclick: (() => unknown) | undefined;
  private text = "";
  constructor(readonly tag: string) {}
  set textContent(text: string) {
    this.text = text;
    this.children = [];
  }
  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join("");
  }
  append(...children: Element[]) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children: Element[]) {
    this.text = "";
    this.children = [];
    this.append(...children);
  }
  setAttribute(name: string, value: string) {
    if (name === "id") this.id = value;
  }
  replaceWith(node: Element) {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    this.parent.children[index] = node;
    node.parent = this.parent;
  }
  remove() {
    if (this.parent)
      this.parent.children = this.parent.children.filter(
        (child) => child !== this,
      );
  }
}
function find(
  node: Element,
  predicate: (node: Element) => boolean,
): Element | undefined {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return undefined;
}
async function browser(
  storage = new Map<string, string>(),
  stocks = { "house-blend": 5, "dark-roast": 3, decaf: 0 },
  projectPath = "/tmp/coffee-shop",
) {
  const page = coffeeShopPage(projectPath);
  const roots = [...page.split("<script>")[0]!.matchAll(/id="([^"]+)"/gu)].map(
    (match) => {
      const node = new Element("div");
      node.id = match[1]!;
      return node;
    },
  );
  const root = (id: string) =>
    roots.map((node) => find(node, (node) => node.id === id)).find(Boolean)!;
  const server = {
    productMode: "valid",
    orderMode: "accepted",
    deduct: false,
    revision: "original",
    checkOk: false,
  };
  const calls: string[] = [];
  const milestones: { event: string; step: number }[] = [];
  let poll: (() => unknown) | undefined;
  const products = () => [
    {
      id: "house-blend",
      name: "House Blend",
      description: "Coffee",
      price: 1400,
      stock: stocks["house-blend"],
    },
    {
      id: "dark-roast",
      name: "Dark Roast",
      description: "Coffee",
      price: 1600,
      stock: stocks["dark-roast"],
    },
    {
      id: "decaf",
      name: "Decaf",
      description: "Coffee",
      price: 1500,
      stock: stocks.decaf,
    },
  ];
  const context = vm.createContext({
    document: {
      hidden: false,
      createElement: (tag: string) => new Element(tag),
      getElementById: root,
    },
    window: { addEventListener: () => undefined },
    navigator: {},
    AbortController,
    URL,
    setTimeout,
    clearTimeout,
    setInterval: (callback: () => void) => {
      poll = callback;
      return 1;
    },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) || null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    fetch: async (path: string, options: { body?: string } = {}) => {
      calls.push(path);
      let status = 200;
      let result: unknown;
      if (path === "/tutorial-info")
        result = { sessionId: "same-api-session", revision: server.revision };
      else if (path === "/tutorial-event") {
        if (server.productMode === "telemetry-offline")
          throw Error("Reporting unavailable");
        milestones.push(JSON.parse(options.body!));
        result = { ok: true };
      } else if (path === "/tutorial-check")
        result = {
          revision: server.revision,
          ok: server.checkOk,
          message: server.checkOk
            ? "Saved change checked"
            : "Expected different handler behavior",
        };
      else if (path === "/products") {
        if (server.productMode === "offline") throw Error("Disconnected");
        result =
          server.productMode === "invalid"
            ? [{ id: "house-blend" }]
            : products();
      } else {
        if (server.orderMode === "offline") throw Error("No confirmation");
        const items = (
          JSON.parse(options.body!) as {
            items: { productId: keyof typeof stocks; quantity: number }[];
          }
        ).items;
        status =
          server.orderMode === "shortage"
            ? 409
            : server.orderMode === "unavailable"
              ? 503
              : 201;
        result =
          status === 409
            ? {
                error: "Not enough stock",
                shortages: items.map((item) => ({
                  productId: item.productId,
                  requested: item.quantity,
                  available: stocks[item.productId],
                })),
              }
            : { orderId: 1 };
        if (status === 201 && server.deduct)
          for (const item of items) stocks[item.productId] -= item.quantity;
      }
      return { status, ok: status < 400, json: async () => result };
    },
  });
  const read = <T = unknown>(code: string): T =>
    vm.runInContext(code, context) as T;
  vm.runInContext(page.split("<script>")[1]!.split("</script>")[0]!, context);
  await read<Promise<void>>("walkthroughReady");
  return {
    server,
    stocks,
    calls,
    milestones,
    root,
    read,
    storage,
    add(id = "house-blend") {
      const card = find(
        root("products"),
        (node) => node.dataset.productId === id,
      )!;
      find(card, (node) => node.tag === "button")!.onclick!();
    },
    order: () => read<Promise<void>>("placeOrder()"),
    async poll() {
      await poll!();
    },
  };
}

it("shows shopper availability while adding to the cart leaves API inventory unchanged", async () => {
  const app = await browser();
  app.add();
  expect(app.stocks["house-blend"]).toBe(5);
  expect(app.root("products").textContent).toContain("4 more bags available");
});

it("automatically refreshes shop availability after accepted orders", async () => {
  const app = await browser();
  app.add();
  await app.order();
  expect(app.root("products").textContent).toContain("5 bags available");
  expect(app.root("guide-status").textContent).toContain(
    "House Blend API stock stayed at 5",
  );
  app.server.deduct = true;
  app.add();
  await app.order();
  expect(app.root("products").textContent).toContain("4 bags available");
  expect(app.root("guide-status").textContent).toContain(
    "House Blend API stock 5 → 4 after checkout",
  );
  expect(app.calls.filter((path) => path === "/orders")).toHaveLength(2);
});

it("observes a live inventory edit and credits the response without manual refresh", async () => {
  const app = await browser();
  app.read("progress.step=2;showLesson()");
  app.stocks.decaf = 5;
  app.server.checkOk = true;
  app.server.revision = "decaf-change";
  await app.poll();
  expect(app.read("progress.step")).toBe(3);
  expect(app.read("progress.done")).toBe(false);
  expect(app.root("products").textContent).toContain("Decaf");
  expect(app.stocks.decaf).toBe(5);
  app.add("decaf");
  expect(app.root("guide-status").textContent).toContain(
    "Decaf is in your cart",
  );
  find(
    app.root("cart"),
    (node) => node.tag === "button" && node.textContent === "Remove",
  )!.onclick!();
  expect(app.root("guide-status").textContent).toBe("");
});

it("keeps rejected carts and explains server-reported requested and available quantities", async () => {
  const app = await browser();
  app.add();
  app.stocks["house-blend"] = 0;
  app.server.orderMode = "shortage";
  await app.order();
  expect(app.root("shop-notice").textContent).toContain(
    "House Blend: your cart requested 1; the order API reported 0 available",
  );
  expect(app.root("cart").textContent).toContain("House Blend × 1");
});

it.each(["invalid", "offline"])(
  "marks %s product data stale and reconnects without losing the cart",
  async (mode) => {
    const app = await browser();
    app.add();
    app.server.productMode = mode;
    await app.poll();
    expect(app.root("products").textContent).toContain(
      "Availability temporarily unavailable",
    );
    expect(app.root("checkout").disabled).toBe(true);
    expect(app.root("cart").textContent).toContain("House Blend × 1");
    app.server.productMode = "valid";
    await app.poll();
    expect(app.root("checkout").disabled).toBe(false);
    expect(app.root("products").textContent).not.toContain(
      "Availability temporarily unavailable",
    );
  },
);

it("distinguishes an unknown confirmation from rejection and prevents duplicate simultaneous orders", async () => {
  const app = await browser();
  app.add();
  app.server.orderMode = "offline";
  await Promise.all([app.order(), app.order()]);
  expect(app.calls.filter((path) => path === "/orders")).toHaveLength(1);
  expect(app.root("shop-notice").textContent).toContain(
    "may have been accepted",
  );
  expect(app.root("cart").textContent).toContain("House Blend × 1");
});

it("preserves the current lesson and cart on reload without another order", async () => {
  const app = await browser();
  app.read("progress.step=1;showLesson()");
  app.add();
  const restored = await browser(app.storage, app.stocks);
  expect(restored.read("progress.step")).toBe(1);
  expect(restored.root("cart").textContent).toContain("House Blend × 1");
  expect(restored.calls).not.toContain("/orders");
});

it.each([
  ["/tmp/coffee shop#1?", "vscode://file/tmp/coffee%20shop%231%3F/"],
  [String.raw`C:\coffee shop\demo`, "vscode://file/C:/coffee%20shop/demo/"],
])(
  "links instructional file names, including bold actions and hints (%s)",
  async (projectPath, base) => {
    const app = await browser(undefined, undefined, projectPath);
    app.read("progress.step=7;progress.inventoryUpdated=false;showLesson()");
    const paragraph = app.root("instruction-text");
    expect(
      find(
        app.root("lesson"),
        (node) => node.tag === "a" && node.textContent === "Open in VSCode",
      )?.href,
    ).toBe(base + "routes/orders.ts");
    expect(
      find(
        app.root("lesson"),
        (node) =>
          node.tag === "button" && node.textContent === "Copy file path",
      )?.parent?.className,
    ).toBe("file-actions");
    expect(
      find(
        paragraph,
        (node) =>
          node.tag === "a" && node.textContent === "routes/_.context.ts",
      )?.href,
    ).toBe(base + "routes/_.context.ts");
    expect(
      find(
        paragraph,
        (node) => node.tag === "a" && node.textContent === "routes/orders.ts",
      )?.href,
    ).toBe(base + "routes/orders.ts");
    expect(
      find(
        app.root("lesson"),
        (node) =>
          node.tag === "a" &&
          node.textContent === projectPath + "/routes/orders.ts",
      )?.href,
    ).toBe(base + "routes/orders.ts");
    app.read("passedSaveCheck=true;updateAction()");
    expect(
      find(
        app.root("instruction-text"),
        (node) => node.tag === "a" && node.textContent === "routes/orders.ts",
      )?.href,
    ).toBe(base + "routes/orders.ts");
    app.read("progress.step=11;showLesson()");
    expect(
      find(
        app.root("lesson"),
        (node) => node.tag === "a" && node.textContent === "openapi.json",
      )?.href,
    ).toBe(base + "openapi.json");
  },
);

it("detects saves, reports a failed check, and advances the action only after a passing check", async () => {
  const app = await browser();
  app.read("progress.step=4;cart={'house-blend':1};showLesson()");
  await app.poll(); // Establish the lesson's saved revision; no failed alert before an edit.
  expect(app.root("save-check").textContent).toBe("");
  expect(app.root("lesson").textContent).not.toContain("I've saved the file");
  app.server.revision = "wrong-edit";
  await app.poll();
  expect(app.root("save-check").textContent).toContain(
    "Expected different handler behavior",
  );
  expect(app.read("passedSaveCheck")).toBe(false);
  const checks = app.calls.filter((path) => path === "/tutorial-check").length;
  await app.poll();
  expect(app.calls.filter((path) => path === "/tutorial-check")).toHaveLength(
    checks,
  );
  app.server.revision = "correct-edit";
  app.server.checkOk = true;
  await app.poll();
  expect(app.root("save-check").textContent).toContain("Saved change checked");
  expect(app.read("passedSaveCheck")).toBe(true);
  expect(app.read("progress.done")).toBe(false);
  expect(app.read("cart")).toEqual({ "house-blend": 1 });
  expect(app.calls.filter((path) => path === "/orders")).toHaveLength(0);
});

it("discards a delayed check when the user has moved to another lesson", async () => {
  const app = await browser();
  app.read(`progress.step=4;showLesson();
    const originalRequest=requestJson;
    let releaseCheck;
    requestJson=async(path,options)=>{if(path==='/tutorial-check')await new Promise(resolve=>releaseCheck=resolve);return originalRequest(path,options);};`);
  const pending = app.read<Promise<void>>("checkSavedFiles()");
  await new Promise((resolve) => setImmediate(resolve));
  app.read("progress.step=5;showLesson();releaseCheck()");
  await pending;
  expect(app.root("save-check").textContent).toBe("");
  expect(app.read("passedSaveCheck")).toBe(false);
});

it("replaces the old failure notice when a saved handler recovers and clears the check after retry", async () => {
  const app = await browser();
  app.read("progress.step=4;showLesson()");
  app.add();
  app.server.orderMode = "unavailable";
  await app.order();
  expect(app.root("shop-notice").textContent).toContain("restore ordering");
  const restored = await browser(app.storage, app.stocks);
  expect(restored.root("checkout").textContent).toBe("Try again");
  app.read("progress.step=5;progress.done=false;showLesson()");
  app.server.orderMode = "accepted";
  app.server.checkOk = true;
  app.server.revision = "recovered";
  await app.poll();
  expect(app.root("shop-notice").textContent).toContain(
    "Ordering is available again",
  );
  expect(app.root("shop-notice").textContent).not.toContain("restore ordering");
  expect(app.root("guide-status").textContent).not.toContain(
    "Restore ordering",
  );
  await app.order();
  expect(app.root("save-check").textContent).toBe("");
  expect(app.read("progress.done")).toBe(true);
});

it("completes all eight lessons with automatic transitions inside each concept", async () => {
  const app = await browser();
  const advance = async () => {
    app.root("continue").onclick!();
    await app.poll();
  };
  await advance();
  expect(app.root("lesson").textContent).not.toContain("✓ Step complete");
  app.add();
  await app.order();
  expect(app.root("step-completion").textContent).toBe("✓ Step complete");
  expect(app.root("continue").hidden).toBe(false);
  expect(app.root("guide-status").textContent).toContain(
    "has not reduced stock",
  );
  await advance();
  expect(app.root("shop-notice").textContent).toBe("");
  expect(app.root("lesson").textContent).not.toContain("✓ Step complete");
  app.stocks.decaf = 5;
  app.server.revision = "decaf";
  app.server.checkOk = true;
  await app.poll();
  expect(app.read("progress.step")).toBe(3);
  expect(app.root("lesson").textContent).toContain("Step 3 of 8");
  expect(app.root("continue").hidden).toBe(true);
  expect(app.root("lesson").textContent).not.toContain("✓ Step complete");
  expect(app.root("save-check").textContent).toBe("");
  app.add("decaf");
  await app.order();
  expect(app.root("step-completion").textContent).toBe("✓ Step complete");
  await advance();
  app.add("dark-roast");
  app.server.orderMode = "unavailable";
  await app.order();
  expect(app.read("progress.step")).toBe(5);
  expect(app.root("lesson").textContent).toContain("Step 4 of 8");
  app.server.orderMode = "accepted";
  app.server.revision = "recovered";
  await app.poll();
  await app.order();
  expect(app.root("save-check").textContent).toBe("");
  await advance();
  app.add("dark-roast");
  await app.order();
  expect(app.read("progress.step")).toBe(7);
  expect(app.root("lesson").textContent).toContain("Step 5 of 8");
  app.server.deduct = true;
  app.server.revision = "subtract";
  await app.poll();
  app.add("dark-roast");
  await app.order();
  await advance();
  app.add("dark-roast");
  app.add("dark-roast");
  await app.order();
  expect(app.stocks["dark-roast"]).toBe(0);
  await advance();
  expect(app.root("lesson").textContent).toContain(
    'context.inventory["dark-roast"] = 5',
  );
  expect(app.root("lesson").textContent).not.toContain("I'm at the REPL");
  app.stocks["dark-roast"] = 5;
  await app.poll();
  expect(app.read("progress.step")).toBe(10);
  expect(app.root("lesson").textContent).toContain("Step 7 of 8");
  expect(app.root("continue").hidden).toBe(true);
  app.add("dark-roast");
  await app.order();
  expect(app.stocks["dark-roast"]).toBe(4);
  await advance();
  expect(app.root("lesson").textContent).toContain("Step 8 of 8");
  expect(app.read("progress.step")).toBe(11);
});

it("keeps usable stock on Back and offers REPL recovery only for depleted inventory", async () => {
  const app = await browser(undefined, {
    "house-blend": 5,
    "dark-roast": 3,
    decaf: 4,
  });
  app.server.checkOk = true;
  app.read("progress.step=4;showLesson()");
  app.root("back").onclick!();
  await app.poll();
  expect(app.read("progress.step")).toBe(3);
  expect(app.stocks.decaf).toBe(4);
  app.stocks.decaf = 0;
  await app.poll();
  expect(app.root("lesson").textContent).toContain(
    "Back keeps your files and inventory",
  );
  expect(app.root("lesson").textContent).toContain(
    'context.inventory["decaf"] = 5',
  );
  expect(app.stocks.decaf).toBe(0);
  app.stocks.decaf = 7;
  await app.poll();
  expect(app.root("lesson").textContent).not.toContain("Back keeps your files");
  app.read("progress.step=1;showLesson()");
  app.stocks["house-blend"] = 0;
  await app.poll();
  expect(app.root("lesson").textContent).toContain(
    'context.inventory["house-blend"] = 5',
  );
  app.stocks["house-blend"] = 5;
  await app.poll();
  expect(app.root("lesson").textContent).toContain(
    "Add House Blend to your cart",
  );
});

it("recovers the original retry cart after a different successful purchase and reload", async () => {
  const storage = new Map<string, string>();
  const app = await browser(storage);
  app.read("progress.step=4;showLesson()");
  app.add();
  app.server.orderMode = "unavailable";
  await app.order();
  expect(app.read("progress.step")).toBe(5);
  app.add();
  expect(app.root("retry-recovery").textContent).toContain("House Blend × 1");
  app.server.orderMode = "accepted";
  await app.order();
  expect(app.read("progress.done")).toBe(false);
  expect(app.root("cart").textContent).toContain("empty");
  expect(app.root("retry-recovery").textContent).toContain(
    "Restore original cart",
  );
  const restored = await browser(storage);
  expect(restored.root("retry-recovery").textContent).toContain(
    "House Blend × 1",
  );
  find(restored.root("retry-recovery"), (node) => node.tag === "button")!
    .onclick!();
  expect(restored.root("cart").textContent).toContain("House Blend × 1");
  expect(restored.root("retry-recovery").textContent).toBe("");
  await restored.order();
  expect(restored.read("progress.done")).toBe(true);
  expect(restored.root("step-completion").textContent).toBe("✓ Step complete");
});

it("names the restart directory and fresh session behavior at the handoff", async () => {
  const app = await browser();
  app.read("progress.step=11;showLesson()");
  expect(app.root("lesson").textContent).toContain("run this from /tmp:");
  expect(app.root("lesson").textContent).toContain("--port 3100");
  expect(app.root("lesson").textContent).toContain("keeps your handler edits");
  expect(app.root("lesson").textContent).toContain(
    "fresh inventory, lesson progress, and cart",
  );
});

it("reports observed exercise completion once while polling and navigation stay usable", async () => {
  const app = await browser();
  expect(app.milestones).toEqual([{ event: "opened", step: 0 }]);
  app.root("continue").onclick!();
  app.add();
  await app.order();
  await app.poll();
  app.read("checkProgress();checkProgress()");
  expect(app.milestones).toEqual([
    { event: "opened", step: 0 },
    { event: "started", step: 0 },
    { event: "phase_completed", step: 1 },
  ]);
  app.root("continue").onclick!();
  app.root("skip").onclick!();
  expect(app.milestones.at(-1)).toEqual({ event: "lesson_skipped", step: 2 });
  expect(app.milestones).not.toContainEqual({
    event: "phase_completed",
    step: 2,
  });
  app.read("progress.step=11;showLesson();showLesson()");
  expect(
    app.milestones.filter((event) => event.event === "finished"),
  ).toHaveLength(1);
});

it("reports automatic phase completion before moving to the next instruction", async () => {
  const app = await browser();
  app.read("progress.step=2;showLesson()");
  app.stocks.decaf = 5;
  app.server.checkOk = true;
  app.server.revision = "decaf-change";
  await app.poll();
  expect(app.milestones).toContainEqual({ event: "phase_completed", step: 2 });
  expect(app.read("progress.step")).toBe(3);
});

it("continues lessons when milestone reporting fails", async () => {
  const app = await browser();
  app.server.productMode = "telemetry-offline";
  app.root("continue").onclick!();
  app.add();
  await app.order();
  expect(app.read("progress.done")).toBe(true);
  expect(app.root("step-completion").textContent).toContain("Step complete");
});
