import vm from "node:vm";
import { expect, it } from "@jest/globals";
import { coffeeShopPage } from "../../src/coffee-shop/coffee-shop-page.js";
import type { EditEvent } from "../../src/coffee-shop/coffee-shop-workspace.js";
import {
  CATALOG,
  PHASES,
  LESSON_COUNT,
} from "../../src/coffee-shop/coffee-shop-lessons.js";

class Element {
  attributes: Record<string, string> = {};
  private styles = new Map<string, string>();
  style = {
    setProperty: (name: string, value: string) => this.styles.set(name, value),
    getPropertyValue: (name: string) => this.styles.get(name),
  };
  bounds = { left: 0, width: 1200 };
  getBoundingClientRect() {
    return this.bounds;
  }
  capturedPointer: number | undefined;
  setPointerCapture(id: number) {
    this.capturedPointer = id;
  }
  hasPointerCapture(id: number) {
    return this.capturedPointer === id;
  }
  releasePointerCapture() {
    this.capturedPointer = undefined;
  }
  onpointerdown:
    | ((event: {
        pointerId: number;
        button: number;
        preventDefault: () => void;
      }) => unknown)
    | undefined;
  onpointermove:
    ((event: { pointerId: number; clientX: number }) => unknown) | undefined;
  onpointerup: ((event: { pointerId: number }) => unknown) | undefined;
  onpointercancel: ((event: { pointerId: number }) => unknown) | undefined;
  onkeydown:
    | ((event: {
        key: string;
        shiftKey?: boolean;
        preventDefault: () => void;
      }) => unknown)
    | undefined;
  id = "";
  href = "";
  className = "";
  disabled = false;
  hidden = false;
  open = false;
  dataset: Record<string, string> = {};
  children: Element[] = [];
  scrolls: unknown[] = [];
  scrollIntoView(options: unknown) {
    this.scrolls.push(options);
  }
  onclick: (() => unknown) | undefined;
  ontoggle: (() => unknown) | undefined;
  private text = "";
  constructor(readonly tag: string) {}
  get tagName() {
    return this.tag.toUpperCase();
  }
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
    this.attributes[name] = value;
    if (name === "id") this.id = value;
  }
  querySelectorAll(selector = "details[open]") {
    const result: Element[] = [];
    const visit = (current: Element) => {
      if (
        current.tag === "details" &&
        (!selector.includes("[open]") || current.open) &&
        (!selector.includes(".file-diff") || current.className === "file-diff")
      )
        result.push(current);
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
    checkpoints?: number[];
    state?: { catalog: unknown; inventory: Record<string, number> | null };
    offline?: boolean;
    locations?: Record<string, Record<string, number>>;
    acknowledge?: boolean;
  } = {},
) {
  const storage = options.storage ?? new Map<string, string>();
  const phaseIndex = PHASES.findIndex(
    (phase) => phase.id === (options.phase ?? "explore"),
  );
  const productData = structuredClone(options.products ?? CATALOG);
  const server = {
    previewRevision: "proposal-v1",
    previewFiles: [
      {
        file: "routes/products.ts",
        before: "return $.response.status(200).random();",
        after: "const catalog = [];\nreturn $.response.status(200).random();",
      },
    ],
    replSubmissions: [] as { id: string; command: string }[],
    workspace: {
      enabled: !!options.workspace,
      prepared: options.prepared ?? [],
      checkpoints: options.checkpoints ?? [],
      changes: [] as EditEvent[],
      locations: options.locations ?? {},
    },
    checkpointError: false,
    offline: options.offline ?? false,
    revision: "initial",
    sessionId: options.sessionId ?? "same-session",
    checkOk: options.checkOk ?? false,
    deduct: options.deduct ?? false,
    orderMode: "echo",
    productMode: "valid",
    products: productData,
    state: options.state ?? {
      catalog: null as unknown,
      inventory: null as Record<string, number> | null,
    },
    example: "Chocolate and caramel.",
    nextId: 1,
  };
  if (options.phase || (!options.storage && !options.checkpoints?.length))
    storage.set(
      "counterfact-coffee-v5",
      JSON.stringify({
        version: 5,
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
  let reloaded = false;
  const context = vm.createContext({
    document: {
      hidden: false,
      createElement: (tag: string) => new Element(tag),
      getElementById: root,
    },
    window: {
      addEventListener: () => undefined,
      matchMedia: () => ({ matches: true }),
      location: {
        reload: () => {
          reloaded = true;
        },
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
      if (server.offline) throw new TypeError("Failed to fetch");
      const body = request.body
        ? (JSON.parse(request.body) as Record<string, unknown>)
        : undefined;
      calls.push({ path, body });
      let status = 200,
        value: unknown;
      if (path === "/tutorial/info")
        value = {
          workspace: structuredClone(server.workspace),
          sessionId: server.sessionId,
          revision: server.revision,
          state: structuredClone(server.state),
          replSubmissions: structuredClone(server.replSubmissions),
        };
      else if (path === "/tutorial/workspace") {
        const stale =
          body?.action === "prepare" &&
          body.revision !== server.previewRevision;
        if (body?.action === "prepare" && !stale && !server.checkpointError) {
          server.workspace.prepared.push(String(body.phaseId));
          server.workspace.changes.push({
            id: server.workspace.changes.length + 1,
            actor: "milo",
            phaseId: String(body.phaseId),
            files: structuredClone(server.previewFiles),
          });
        }
        value = {
          ok: !server.checkpointError && !stale,
          message: stale
            ? "Your files changed since this preview."
            : server.checkpointError
              ? "Progress storage is temporarily unavailable"
              : "Saved progress",
          files:
            body?.action === "preview" && !server.checkpointError
              ? structuredClone(server.previewFiles)
              : undefined,
          revision:
            body?.action === "preview" && !server.checkpointError
              ? server.previewRevision
              : undefined,
          changes:
            body?.action === "prepare"
              ? structuredClone(server.workspace.changes)
              : undefined,
        };
      } else if (path === "/tutorial/check")
        value = {
          revision: server.revision,
          ok: server.checkOk,
          examples:
            body?.phaseId === "description-example"
              ? [server.example, "Rich cocoa and a bold finish."]
              : undefined,
          message: server.checkOk
            ? "Saved implementation verified."
            : "Expected an explicit implementation.",
        };
      else if (path === "/tutorial/event") value = { ok: true };
      else if (path === "/shop/products") {
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
          path === "/shop/orders" && server.orderMode === "malformed"
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
  async function acknowledge() {
    if (options.acknowledge === false) return;
    for (let step = 0; step < 200; step++) {
      const okay = find(
        root("lesson"),
        (element) =>
          element.tag === "button" &&
          ["Okay", "Folder is open"].includes(element.textContent),
      );
      if (!okay) return;
      await okay.onclick!();
    }
    throw new Error("Conversation did not finish revealing its messages.");
  }
  await acknowledge();
  const click = async (id: string, continueReading = true) => {
    await root(id).onclick!();
    if (continueReading) await acknowledge();
  };
  return {
    root,
    server,
    calls,
    storage,
    wasReloaded: () => reloaded,
    click,
    acknowledge,
    api: {
      async placeOrder() {
        await api.placeOrder();
        await acknowledge();
      },
      async checkFiles(force?: boolean) {
        await api.checkFiles(force);
        await acknowledge();
      },
    },
    async poll(continueReading = true) {
      await poll!();
      await new Promise((resolve) => setImmediate(resolve));
      if (continueReading) await acknowledge();
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
      await acknowledge();
    },
    completed() {
      return (
        JSON.parse(storage.get("counterfact-coffee-v5")!) as {
          completed: string[];
        }
      ).completed;
    },
  };
}

it("starts with a coffee order to learn the tutorial before inspecting or editing code", async () => {
  const app = await browser({ phase: "orientation" });
  expect(app.root("lesson").textContent).toContain("GET /shop/products");
  expect(app.root("lesson").textContent).toContain("POST /shop/orders");
  expect(app.root("lesson").textContent).not.toContain("/tutorial/*");
  expect(app.root("lesson").textContent).not.toContain("We’ll take turns");
  expect(app.root("lesson").textContent).not.toContain(
    "You’ll try it in the shop or terminal",
  );
  expect(app.root("lesson").textContent).not.toContain(
    "Whenever either of us changes",
  );
  expect(app.root("lesson").textContent).toContain(
    "Click Add to cart on any coffee with stock, then click Place order",
  );
  expect(app.root("lesson").textContent).not.toContain(
    "Open routes/products.ts",
  );
  await app.click("refresh-products", false);
  expect(app.completed()).not.toContain("orientation");
  app.add();
  await app.click("checkout", false);
  expect(app.completed()).toContain("orientation");
  expect(app.root("continue").textContent).toBe(
    "Next Lesson: Explore your generated API",
  );
  expect(app.calls.some((call) => call.path === "/shop/orders")).toBe(true);
  expect(app.calls.some((call) => call.body?.action === "prepare")).toBe(false);
});

it("waits for approval, a saved edit, and live requests instead of offering Okay for the exercise", async () => {
  const app = await browser({ phase: "catalog", workspace: true });
  const okay = () =>
    find(
      app.root("lesson"),
      (element) => element.tag === "button" && element.textContent === "Okay",
    );
  expect(okay()).toBeUndefined();
  expect(app.server.workspace.prepared).toEqual([]);
  await app.poll(false);
  expect(app.server.workspace.prepared).toEqual([]);
  const apply = find(
    app.root("lesson"),
    (element) =>
      element.tag === "button" && element.textContent === "Apply changes",
  )!;
  await apply.onclick!();
  expect(app.root("lesson").textContent).toContain(
    "replace .random() with .json(catalog)",
  );
  expect(okay()).toBeUndefined();
  expect(app.root("check-progress").hidden).toBe(false);
  expect(app.completed()).not.toContain("catalog");
  app.server.checkOk = true;
  app.server.revision = "user-saved-catalog";
  app.server.workspace.changes.push({
    id: 2,
    actor: "you",
    phaseId: "catalog",
    files: [{ file: "routes/products.ts", before: "random", after: "catalog" }],
  });
  await app.poll(false);
  expect(app.root("lesson").textContent).toContain(
    "Great job! You replaced the default random response",
  );
  expect(okay()).toBeUndefined();
  expect(app.completed()).not.toContain("catalog");
  await app.click("refresh-products", false);
  expect(app.root("lesson").textContent).toContain(
    "Click Refresh products once more",
  );
  expect(okay()).toBeUndefined();
  expect(app.completed()).not.toContain("catalog");
  await app.click("refresh-products", false);
  expect(app.completed()).toContain("catalog");
  expect(app.root("continue").hidden).toBe(false);
});

it("resizes the panels by dragging, clamps their widths, and restores the split on reload", async () => {
  const app = await browser();
  const divider = app.root("panel-divider");
  const layout = app.root("walkthrough-layout");
  divider.onpointermove!({ pointerId: 1, clientX: 800 });
  expect(layout.style.getPropertyValue("--guide-share")).toBe("0.5");
  divider.onpointerdown!({ pointerId: 1, button: 0, preventDefault() {} });
  expect(divider.capturedPointer).toBe(1);
  divider.onpointermove!({ pointerId: 2, clientX: 500 });
  expect(layout.style.getPropertyValue("--guide-share")).toBe("0.5");
  divider.onpointermove!({ pointerId: 1, clientX: 719 });
  expect(divider.attributes["aria-valuenow"]).toBe("60");
  divider.onpointerup!({ pointerId: 1 });
  expect(divider.capturedPointer).toBeUndefined();
  expect(layout.dataset.resizing).toBeUndefined();
  const restored = await browser({ storage: app.storage });
  expect(restored.root("panel-divider").attributes["aria-valuenow"]).toBe("60");
  divider.onpointerdown!({ pointerId: 3, button: 0, preventDefault() {} });
  divider.onpointermove!({ pointerId: 3, clientX: 9999 });
  expect(Number(layout.style.getPropertyValue("--guide-share"))).toBeCloseTo(
    (1188 - 360) / 1188,
  );
  divider.onpointercancel!({ pointerId: 3 });
  expect(layout.dataset.resizing).toBeUndefined();
});

it("supports resizing the panels with arrow keys and Home/End", async () => {
  const app = await browser();
  const divider = app.root("panel-divider");
  divider.onkeydown!({ key: "ArrowRight", preventDefault() {} });
  expect(divider.attributes["aria-valuenow"]).toBe("52");
  divider.onkeydown!({ key: "ArrowLeft", preventDefault() {} });
  expect(divider.attributes["aria-valuenow"]).toBe("50");
  divider.onkeydown!({ key: "Home", preventDefault() {} });
  expect(divider.attributes["aria-valuenow"]).toBe(
    divider.attributes["aria-valuemin"],
  );
  divider.onkeydown!({ key: "End", preventDefault() {} });
  expect(divider.attributes["aria-valuenow"]).toBe(
    divider.attributes["aria-valuemax"],
  );
});

it("reveals long explanations a message at a time and keeps the pause across reloads", async () => {
  const app = await browser({ acknowledge: false });
  expect(app.root("lesson").textContent).toContain("Hi, I’m Milo.");
  expect(app.root("lesson").textContent).not.toContain("We’ll take turns.");
  expect(app.root("lesson").textContent).not.toContain(
    "Explore your generated API",
  );
  const okay = find(
    app.root("lesson"),
    (element) =>
      element.tag === "button" &&
      ["Okay", "Folder is open"].includes(element.textContent),
  )!;
  await okay.onclick!();
  expect(app.root("lesson").textContent).toContain(
    "The shop uses GET /shop/products",
  );
  expect(app.root("lesson").textContent).not.toContain(
    "You’ll try it in the shop or terminal",
  );
  const visible = app.root("lesson").textContent;
  await app.poll();
  expect(app.root("lesson").textContent).toBe(visible);
  const restored = await browser({ storage: app.storage, acknowledge: false });
  expect(restored.root("lesson").textContent).toBe(visible);
  expect(restored.root("continue").hidden).toBe(true);
  expect(restored.root("check-progress").hidden).toBe(true);
  let next = find(
    restored.root("lesson"),
    (element) =>
      element.tag === "button" &&
      ["Okay", "Folder is open"].includes(element.textContent),
  );
  for (let count = 0; next && count < 30; count++) {
    await next.onclick!();
    next = find(
      restored.root("lesson"),
      (element) =>
        element.tag === "button" &&
        ["Okay", "Folder is open"].includes(element.textContent),
    );
  }
  expect(next).toBeUndefined();
  expect(restored.root("lesson").textContent).toContain(
    "The generated starting handler",
  );
  expect(restored.completed()).not.toContain("explore");
  expect(
    restored.calls.filter(
      (call) =>
        call.path === "/tutorial/workspace" && call.body?.action === "prepare",
    ),
  ).toHaveLength(0);
});

it("requires a user action between every Milo message, including the final OpenAPI background part", async () => {
  const app = await browser({ acknowledge: false });
  const tutorCount = () =>
    app
      .root("lesson")
      .children.filter(
        (turn) =>
          turn.className === "chat-turn tutor-turn" &&
          turn.dataset.phase !== "orientation",
      ).length;
  let foundSource = false;
  for (let step = 0; step < 30; step++) {
    const okay = find(
      app.root("lesson"),
      (element) =>
        element.tag === "button" &&
        ["Okay", "Folder is open"].includes(element.textContent),
    );
    if (!okay) break;
    const before = tutorCount();
    await okay.onclick!();
    expect(tutorCount()).toBe(before + 1);
    if (
      app
        .root("lesson")
        .textContent.includes("Counterfact includes a coffee-shop API")
    ) {
      foundSource = true;
      break;
    }
  }
  expect(foundSource).toBe(true);
  expect(app.root("lesson").textContent).not.toContain(
    "Open routes/products.ts",
  );
  const visible = app.root("lesson").textContent;
  await app.poll();
  expect(app.root("lesson").textContent).toBe(visible);
  const restored = await browser({ storage: app.storage, acknowledge: false });
  expect(restored.root("lesson").textContent).toBe(visible);
});

it("pauses between the introductory explanation and welcome-back handoff", async () => {
  const app = await browser({
    acknowledge: false,
    workspace: true,
    checkpoints: [1],
  });
  const acknowledgeOne = async () => {
    const before = app
      .root("lesson")
      .children.filter(
        (turn) => turn.className === "chat-turn tutor-turn",
      ).length;
    const okay = find(
      app.root("lesson"),
      (element) =>
        element.tag === "button" &&
        ["Okay", "Folder is open"].includes(element.textContent),
    )!;
    await okay.onclick!();
    expect(
      app
        .root("lesson")
        .children.filter((turn) => turn.className === "chat-turn tutor-turn"),
    ).toHaveLength(before + 1);
  };
  for (
    let step = 0;
    step < 15 &&
    !app
      .root("lesson")
      .textContent.includes("The shop uses GET /shop/products");
    step++
  )
    await acknowledgeOne();
  expect(app.root("lesson").textContent).toContain(
    "The shop uses GET /shop/products",
  );
  expect(app.root("lesson").textContent).not.toContain("Welcome back");
  await app.poll();
  expect(app.root("lesson").textContent).not.toContain("Welcome back");
  const restored = await browser({
    storage: app.storage,
    acknowledge: false,
    workspace: true,
    checkpoints: [1],
  });
  expect(restored.root("lesson").textContent).toBe(
    app.root("lesson").textContent,
  );
  await acknowledgeOne();
  expect(app.root("lesson").textContent).toContain("Welcome back");
});

it("scrolls to new conversation messages without scrolling on unchanged polling", async () => {
  const app = await browser();
  await app.click("empty-cart");
  expect(app.root("conversation-end").scrolls).toEqual([
    { block: "end", behavior: "auto" },
  ]);
  await app.poll();
  expect(app.root("conversation-end").scrolls).toEqual([
    { block: "end", behavior: "auto" },
  ]);
  app.server.workspace.changes.push({
    id: 1,
    actor: "you",
    files: [{ file: "routes/products.ts", before: "old", after: "new" }],
  });
  await app.poll();
  expect(app.root("conversation-end").scrolls).toEqual([
    { block: "end", behavior: "auto" },
  ]);
  await app.poll();
  expect(app.root("conversation-end").scrolls).toEqual([
    { block: "end", behavior: "auto" },
  ]);
});

it("alerts when the server stops and reconnects when it returns", async () => {
  const app = await browser({ origin: "http://localhost:4123" });
  const alert = app.root("connection-alert");
  expect(alert.hidden).toBe(true);
  app.server.offline = true;
  await app.poll();
  expect(alert.hidden).toBe(false);
  expect(alert.textContent).toContain(
    "You may have stopped Counterfact in the terminal",
  );
  expect(alert.textContent).toContain(
    "npx counterfact ./coffee shop#1?/openapi.yaml ./coffee shop#1? --port 4123",
  );
  expect(
    find(alert, (element) => element.tag === "pre")?.children[0]?.tag,
  ).toBe("code");
  const children = alert.children.length;
  await app.poll();
  expect(alert.children).toHaveLength(children);
  app.server.offline = false;
  await app.poll();
  expect(alert.hidden).toBe(true);
});

it("retries automatically when the server is unavailable during initialization", async () => {
  const app = await browser({ offline: true });
  expect(app.root("connection-alert").hidden).toBe(false);
  app.server.offline = false;
  await app.poll();
  expect(app.root("connection-alert").hidden).toBe(true);
  expect(app.root("products").textContent).toContain("House Blend");
});

it("keeps expected HTTP failures separate from a server outage", async () => {
  const app = await browser({ phase: "fail" });
  app.server.orderMode = "unavailable";
  app.add();
  await app.api.placeOrder();
  expect(app.root("connection-alert").hidden).toBe(true);
});

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
  const turns = JSON.parse(app.storage.get("counterfact-coffee-v5")!).turns as {
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

it("introduces the bundled OpenAPI document before the handler and renders code semantically", async () => {
  const app = await browser();
  const lesson = app.root("lesson");
  const background = lesson.children.find((turn) =>
    turn.textContent.includes("OpenAPI, formerly Swagger"),
  )!;
  expect(background.textContent).toContain(
    "A schema describes the shape of data",
  );
  const schemaSource = lesson.children.find((turn) =>
    turn.textContent.includes("saved a copy as openapi.yaml"),
  )!;
  expect(find(schemaSource, (element) => element.tag === "a")?.href).toBe(
    "vscode://file/tmp/coffee%20shop%231%3F/openapi.yaml:1",
  );
  const instruction = lesson.children.find((turn) =>
    turn.textContent.includes("The generated starting handler"),
  )!;
  expect(lesson.children.indexOf(background)).toBeLessThan(
    lesson.children.indexOf(instruction),
  );
  expect(
    find(
      instruction,
      (element) =>
        element.tag === "code" &&
        element.textContent === "$.response.status(200).random()",
    ),
  ).toBeDefined();
  expect(find(lesson, (element) => element.tag === "pre")).toBeUndefined();
  expect(lesson.textContent).not.toContain("`$.response");
});

it.each(PHASES.map((phase) => phase.id))(
  "gives instructions without solution snippets or prepared commands in %s",
  async (phase) => {
    const app = await browser({ phase });
    expect(
      find(app.root("lesson"), (element) => element.tag === "pre"),
    ).toBeUndefined();
    expect(app.root("lesson").textContent).not.toContain("Show code:");
    expect(app.root("lesson").textContent).not.toContain("Open in VSCode");
    expect(app.root("lesson").textContent).not.toContain("Copy file path");
    expect(
      PHASES.find((candidate) => candidate.id === phase),
    ).not.toHaveProperty("commands");
    for (const edit of PHASES.find((candidate) => candidate.id === phase)!
      .edits)
      expect(edit).not.toHaveProperty("code");
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
  expect(
    app.calls.filter((call) => call.path === "/shop/products"),
  ).toHaveLength(1);
  app.server.products[0]!.name = "Another response";
  await app.click("refresh-products");
  expect(app.root("cart").textContent).toContain("empty");
  expect(app.root("lesson").textContent).toContain("clears the previous cart");
  expect(app.root("products").textContent).toContain("Another response");
  expect(app.completed()).toContain("explore");
  expect(app.root("lesson").textContent).toContain(
    "http://localhost:3100/shop/products",
  );
});

it("rejects duplicate IDs with a useful explanation and recovers on refresh", async () => {
  const app = await browser({ products: [CATALOG[0]!, CATALOG[0]!] });
  await app.click("refresh-products");
  expect(app.root("lesson").textContent).toContain("duplicate IDs");
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
  expect(app.root("lesson").textContent).toContain('"items"');
});

it("requires both saved description examples and an explicit matching generated response", async () => {
  const app = await browser({ phase: "description-example" });
  for (const product of app.server.products)
    product.description = "Chocolate and caramel.";
  await app.click("refresh-products");
  expect(app.completed()).not.toContain("description-example");
  app.server.checkOk = true;
  app.server.revision = "saved-openapi-example";
  app.server.workspace.changes.push({
    id: 1,
    actor: "you",
    files: [
      {
        file: "openapi.yaml",
        before: "maxLength: 120",
        after:
          "maxLength: 120\nexamples: [Chocolate and caramel., Rich cocoa and a bold finish.]",
      },
    ],
  });
  const before = app.calls.filter(
    (call) => call.path === "/shop/products",
  ).length;
  await app.poll();
  expect(
    app.calls.filter((call) => call.path === "/shop/products"),
  ).toHaveLength(before);
  expect(app.root("lesson").textContent).toContain("openapi.yaml");
  expect(app.completed()).not.toContain("description-example");
  app.server.products[0]!.description = "old spec response";
  await app.click("refresh-products");
  expect(app.completed()).not.toContain("description-example");
  app.server.products[0]!.description = "Chocolate and caramel.";
  await app.click("refresh-products");
  expect(app.completed()).toContain("description-example");
  await app.click("continue");
  expect(app.root("lesson").textContent).toContain("Replace random products");
});

it("names the next lesson on the button and records that choice in the conversation", async () => {
  const app = await browser();
  expect(app.root("continue").hidden).toBe(true);
  expect(app.root("continue").textContent).toBe(
    "Next Lesson: Give generated descriptions coffee examples",
  );
  await app.click("refresh-products");
  expect(app.root("continue").hidden).toBe(false);
  await app.click("continue");
  expect(app.root("continue").textContent).toBe(
    "Next Lesson: Replace random products",
  );
  expect(app.root("continue").hidden).toBe(true);
  expect(app.root("lesson").textContent).toContain(
    "Next Lesson: Give generated descriptions coffee examples",
  );
  const finalLesson = await browser({ phase: "scenario" });
  expect(finalLesson.root("continue").hidden).toBe(true);
});

it("renders a distinct heading outside tutor bubbles once per lesson", async () => {
  const app = await browser({ phase: "retry" });
  const headings = app
    .root("lesson")
    .children.filter((element) => element.className === "lesson-heading");
  expect(headings.map((heading) => heading.textContent)).toEqual([
    "Lesson 1Try the coffee shop",
    "Lesson 2Explore your generated API",
    "Lesson 3Give generated descriptions coffee examples",
    "Lesson 4Replace random products",
    "Lesson 5Respond to the order you received",
    "Lesson 6Add failure and recovery",
  ]);
  for (const heading of headings) {
    expect(heading.tag).toBe("header");
    expect(find(heading, (element) => element.tag === "h2")).toBeDefined();
    expect(
      find(heading, (element) => element.className === "speaker"),
    ).toBeUndefined();
  }
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
  expect(app.root("lesson").textContent).toContain(
    "Next Lesson: Give generated descriptions coffee examples",
  );
  expect(app.root("lesson").textContent).toContain(
    "Give generated descriptions coffee examples",
  );
  const history = app.root("lesson").textContent;
  expect(history.indexOf("Inspect the generated stub")).toBeLessThan(
    history.indexOf("That worked."),
  );
  expect(history.match(/Hi, I’m Milo\./g)).toHaveLength(1);
  const restored = await browser({ storage: app.storage });
  expect(restored.root("lesson").textContent).toContain(
    "Next Lesson: Give generated descriptions coffee examples",
  );
});

it("does not reveal the recovery edit before the observed failure, then retries the original cart", async () => {
  const app = await browser({ phase: "fail", checkOk: true });
  await app.click("check-progress");
  const guidance = app
    .root("lesson")
    .children.find(
      (turn) =>
        turn.className === "chat-turn tutor-turn" &&
        turn.textContent.includes(
          "Your saved handler now produces a 503 response",
        ),
    )!;
  expect(guidance.textContent).toContain(
    "click Add to cart on House Blend, then click Place order",
  );
  expect(guidance.textContent).toContain("503 response");
  expect(guidance.textContent).toContain("stay in the cart");
  expect(app.root("cart").textContent).toContain("empty");
  expect(app.root("lesson").textContent).not.toContain(
    "Change ordersAvailable to true",
  );
  app.server.orderMode = "unavailable";
  app.add();
  await app.click("checkout");
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
  expect(app.root("lesson").textContent).not.toContain(
    "Implement reduceInventory to visit every ordered item",
  );
  app.add("dark-roast");
  await app.api.placeOrder();
  expect(app.root("inventory-question").textContent).toContain("3 → 3");
  await app.answer("Yes, stock decreased");
  expect(app.root("inventory-question").textContent).toContain(
    "separate operations",
  );
  expect(app.root("lesson").textContent).not.toContain(
    "Implement reduceInventory to visit every ordered item",
  );
  const restored = await browser({ storage: app.storage });
  expect(restored.root("inventory-question").textContent).toContain("3 → 3");
  expect(restored.root("lesson").textContent).toContain(
    "A confirmation does not change context",
  );
  await restored.answer("Try again");
  await restored.answer("No, stock stayed the same");
  expect(restored.root("lesson").textContent).toContain(
    "Implement reduceInventory to visit every ordered item",
  );
  expect(restored.root("lesson").textContent).not.toContain(
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

it("uses each lesson’s current edit line in its inline file link", async () => {
  const app = await browser({
    phase: "description-example",
    locations: {
      explore: { "routes/products.ts": 12, "openapi.yaml": 1 },
      "description-example": { "openapi.yaml": 47 },
    },
  });
  const links: Element[] = [];
  function collect(element: Element) {
    if (element.tag === "a" && element.href.includes("openapi.yaml"))
      links.push(element);
    element.children.forEach(collect);
  }
  for (const turn of app
    .root("lesson")
    .children.filter(
      (element) => element.dataset.phase === "description-example",
    ))
    collect(turn);
  expect(links).toHaveLength(1);
  for (const link of links) expect(link.href).toMatch(/openapi\.yaml:47$/u);
  app.server.workspace.locations["description-example"]!["openapi.yaml"] = 52;
  await app.poll();
  const updated = app
    .root("lesson")
    .children.find((turn) =>
      turn.textContent.includes(
        "add a few sensible coffee descriptions to components.schemas.Product.properties.description.examples",
      ),
    )!;
  expect(
    find(
      updated,
      (element) => element.tag === "a" && element.href.includes("openapi.yaml"),
    )?.href,
  ).toMatch(/openapi\.yaml:52$/u);
});

it("keeps escaped editor links after a save check without exposing solutions", async () => {
  const app = await browser({ phase: "catalog" });
  const editorLink = () =>
    find(
      app.root("lesson"),
      (element) =>
        element.tag === "a" && element.textContent === "routes/products.ts",
    );
  expect(editorLink()?.href).toBe(
    "vscode://file/tmp/coffee%20shop%231%3F/routes/products.ts:1",
  );
  expect(app.root("lesson").textContent).toContain(
    "replace .random() with .json(catalog)",
  );
  expect(app.root("lesson").textContent).not.toContain("Show code:");
  expect(app.root("lesson").textContent).not.toContain("Open in VSCode");
  expect(app.root("lesson").textContent).not.toContain("Copy file path");
  expect(
    find(app.root("lesson"), (element) => element.tag === "pre"),
  ).toBeUndefined();
  app.server.revision = "saved";
  await app.poll();
  expect(editorLink()?.href).toBe(
    "vscode://file/tmp/coffee%20shop%231%3F/routes/products.ts:1",
  );
});

it("requires two observed sequential confirmations to connect the shared context", async () => {
  const app = await browser({ phase: "connect", checkOk: true });
  app.add();
  await app.api.placeOrder();
  expect(app.completed()).not.toContain("connect");
  expect(app.root("lesson").textContent).toContain(
    "Click Add to cart on House Blend, then Place order again.",
  );
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
  expect(app.root("lesson").textContent).toContain(
    "Click Empty cart, restore Dark Roast inventory to 3",
  );
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

it.each(PHASES.filter((phase) => phase.check))(
  "puts feedback for $id in Milo’s conversation once per verified save",
  async (phase) => {
    const app = await browser({ phase: phase.id, checkOk: true });
    await app.click("check-progress");
    const opening = phase.verification!.split(". ")[0]!;
    const feedback = app
      .root("lesson")
      .children.filter((turn) => turn.textContent.includes(opening));
    expect(feedback).toHaveLength(1);
    expect(feedback[0]?.className).toBe("chat-turn tutor-turn");
    expect(app.root("save-check").textContent).toBe("");
    expect(app.root("lesson").textContent).not.toContain(
      "Saved implementation verified.",
    );
    await app.api.checkFiles(true);
    await app.poll();
    const restored = await browser({ storage: app.storage, checkOk: true });
    expect(
      restored
        .root("lesson")
        .children.filter((turn) => turn.textContent.includes(opening)),
    ).toHaveLength(1);
  },
);

it("waits for a successful saved-code check before congratulating the learner", async () => {
  const app = await browser({ phase: "catalog", checkOk: false });
  const feedback = PHASES.find(
    (phase) => phase.id === "catalog",
  )!.verification!;
  expect(app.root("lesson").textContent).not.toContain(feedback);
  app.server.checkOk = true;
  app.server.revision = "catalog-implemented";
  app.server.workspace.changes.push({
    id: 1,
    actor: "you",
    phaseId: "catalog",
    files: [
      { file: "routes/products.ts", before: "old", after: "saved catalog" },
    ],
  });
  await app.poll();
  expect(app.root("lesson").textContent).toContain(feedback);
  expect(app.completed()).not.toContain("catalog");
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

it("starts a new lesson session without trusting old session observations when project checkpoints are absent", async () => {
  const app = await browser({
    phase: "observe",
    observation: { before: 3, after: 3, quantity: 1 },
  });
  const restarted = await browser({
    storage: app.storage,
    sessionId: "new-server-session",
  });
  expect(restarted.root("lesson").textContent).toContain("Try the coffee shop");
  expect(restarted.completed()).toEqual([]);
});

it("resumes completed projects from durable checkpoints instead of replaying incompatible early handlers", async () => {
  const app = await browser({
    workspace: true,
    checkpoints: Array.from({ length: LESSON_COUNT }, (_, i) => i + 1),
    state: {
      catalog: CATALOG,
      inventory: { "house-blend": 5, "dark-roast": 3, decaf: 0 },
    },
  });
  expect(app.root("lesson").textContent).toContain("Resume this project");
  expect(app.root("lesson").textContent).not.toContain(
    "Explore your generated API",
  );
  const waiting = await browser({
    storage: app.storage,
    workspace: true,
    checkpoints: Array.from({ length: LESSON_COUNT }, (_, i) => i + 1),
  });
  await find(
    waiting.root("lesson"),
    (element) =>
      element.tag === "button" && element.textContent === "Resume this project",
  )!.onclick!();
  await waiting.acknowledge();
  expect(waiting.completed()).toEqual(PHASES.map((phase) => phase.id));
  expect(waiting.root("lesson").textContent).toContain(
    "We’ve built the shop’s behavior together",
  );
  expect(
    waiting.calls
      .filter((call) => call.path === "/tutorial/check")
      .map((call) => call.body?.phaseId),
  ).not.toContain("catalog");
  expect(
    waiting.calls.filter((call) => call.path === "/tutorial/workspace"),
  ).toEqual([]);
});

it("resumes the next unfinished lesson with fresh cart and quiz observations after restart", async () => {
  const prior = await browser({
    phase: "observe",
    observation: { before: 3, after: 3, quantity: 1 },
  });
  prior.add("dark-roast");
  const app = await browser({
    storage: prior.storage,
    workspace: true,
    checkpoints: Array.from(
      { length: PHASES.find((p) => p.id === "rules")!.lesson },
      (_, i) => i + 1,
    ),
    sessionId: "restarted",
  });
  await find(
    app.root("lesson"),
    (element) =>
      element.tag === "button" && element.textContent === "Resume this project",
  )!.onclick!();
  await app.acknowledge();
  expect(app.root("lesson").textContent).toContain(
    "Note Dark Roast’s stock, click its Add to cart button once, then click Place order.",
  );
  expect(app.root("lesson").textContent).not.toContain(
    "Does accepting an order also subtract stock?",
  );
  expect(
    find(app.root("lesson"), (element) => element.id === "inventory-question"),
  ).toBeUndefined();
  expect(app.root("cart").textContent).not.toContain("Dark Roast ×");
  expect(app.completed()).not.toContain("observe");
  expect(app.completed()).toContain("rules");
});

it("lets a resumed seed lesson demonstrate reset even when startup already applied the baseline", async () => {
  const app = await browser({
    workspace: true,
    checkpoints: Array.from(
      { length: PHASES.find((p) => p.id === "context")!.lesson },
      (_, i) => i + 1,
    ),
    prepared: ["seed"],
    checkOk: true,
    state: { catalog: CATALOG, inventory: { "dark-roast": 3 } },
  });
  await find(
    app.root("lesson"),
    (element) =>
      element.tag === "button" && element.textContent === "Resume this project",
  )!.onclick!();
  await app.acknowledge();
  await app.click("check-progress");
  expect(app.root("lesson").textContent).toContain(
    "Startup has already applied the baseline",
  );
  expect(app.root("lesson").textContent).not.toContain(
    "Then run the reset scenario",
  );
  expect(app.completed()).not.toContain("seed");
  app.server.state.inventory!["dark-roast"] = 0;
  await app.click("check-progress");
  expect(app.root("lesson").textContent).toContain(
    "The running inventory has changed. Run the reset scenario in the REPL, then click Check my work.",
  );
  app.server.state.inventory!["dark-roast"] = 3;
  await app.click("check-progress");
  expect(app.completed()).toContain("seed");
});

it("keeps pending, applied, and learner diff disclosures collapsed across actions and reload", async () => {
  const app = await browser({ phase: "catalog", workspace: true });
  const diffs = () => app.root("lesson").querySelectorAll("details.file-diff");
  diffs()[0]!.open = false;
  diffs()[0]!.ontoggle!();
  app.add();
  await app.click("refresh-products");
  expect(diffs()[0]!.open).toBe(false);
  await find(
    app.root("lesson"),
    (element) =>
      element.tag === "button" && element.textContent === "Apply changes",
  )!.onclick!();
  expect(diffs()[0]!.open).toBe(false);
  app.server.workspace.changes.push({
    id: 2,
    actor: "you",
    files: [
      {
        file: "routes/products.ts",
        before: "random()",
        after: "json(catalog)",
      },
    ],
  });
  await app.poll();
  expect(diffs()[1]!.open).toBe(true);
  diffs()[1]!.open = false;
  diffs()[1]!.ontoggle!();
  const restored = await browser({
    storage: app.storage,
    workspace: true,
    prepared: ["catalog"],
  });
  expect(
    restored
      .root("lesson")
      .querySelectorAll("details.file-diff")
      .map((diff) => diff.open),
  ).toEqual([false, false]);
});

it("reloads when an open page detects a new runtime session instead of reusing old observations", async () => {
  const app = await browser({
    phase: "observe",
    observation: { before: 3, after: 3, quantity: 1 },
  });
  app.server.sessionId = "new-runtime";
  await app.poll();
  expect(app.wasReloaded()).toBe(true);
  expect(app.completed()).not.toContain("observe");
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

it("shows the diff before applying, refreshes stale proposals, and marks the same bubble as applied", async () => {
  const app = await browser({ phase: "catalog", workspace: true });
  const proposal = () =>
    find(
      app.root("lesson"),
      (element) => element.dataset.proposal === "catalog",
    )!;
  const apply = () =>
    find(
      proposal(),
      (element) =>
        element.tag === "button" && element.textContent === "Apply changes",
    )!.onclick!();
  expect(proposal().textContent).toContain("+ const catalog = [];");
  expect(proposal().textContent).not.toContain("Changes applied.");
  expect(app.server.workspace.prepared).toEqual([]);
  expect(app.root("lesson").textContent).not.toContain(
    "replace .random() with .json(catalog)",
  );
  app.server.previewRevision = "proposal-v2";
  app.server.previewFiles[0]!.after =
    "const catalog = [2];\nreturn $.response.status(200).random();";
  await apply();
  expect(app.server.workspace.prepared).toEqual([]);
  expect(proposal().textContent).toContain(
    "Your files changed since this preview",
  );
  expect(proposal().textContent).toContain("+ const catalog = [2];");
  await apply();
  expect(proposal().textContent).toContain("Changes applied.");
  expect(proposal().textContent).toContain("+ const catalog = [2];");
  expect(
    app
      .root("lesson")
      .children.filter((element) => element.dataset.proposal === "catalog"),
  ).toHaveLength(1);
  expect(app.server.workspace.changes).toHaveLength(1);
  expect(
    find(
      proposal(),
      (element) =>
        element.tag === "button" && element.textContent === "Apply changes",
    ),
  ).toBeUndefined();
  const restored = await browser({
    storage: app.storage,
    workspace: true,
    prepared: ["catalog"],
  });
  expect(restored.root("lesson").textContent).toContain("Changes applied.");
  expect(restored.root("lesson").textContent).toContain(
    "+ const catalog = [2];",
  );
});

it("keeps a proposal unapplied across reload and lets a failed preview be retried", async () => {
  const app = await browser({ phase: "catalog", workspace: true });
  const restored = await browser({ storage: app.storage, workspace: true });
  expect(restored.server.workspace.prepared).toEqual([]);
  expect(restored.root("lesson").textContent).not.toContain("Changes applied.");
  restored.server.checkpointError = true;
  restored.server.revision = "changed";
  await restored.poll();
  expect(restored.root("lesson").textContent).toContain(
    "Progress storage is temporarily unavailable",
  );
  restored.server.checkpointError = false;
  await find(
    restored.root("lesson"),
    (element) =>
      element.tag === "button" && element.textContent === "Retry preview",
  )!.onclick!();
  expect(restored.server.workspace.prepared).toEqual([]);
  expect(
    find(
      restored.root("lesson"),
      (element) =>
        element.tag === "button" && element.textContent === "Apply changes",
    ),
  ).toBeDefined();
});

it("only prepares attended lessons, retains preparation on reload, and retries failed progress saves", async () => {
  const app = await browser({ phase: "catalog", workspace: true });
  const prepare = find(
    app.root("lesson"),
    (element) =>
      element.tag === "button" && element.textContent === "Apply changes",
  )!;
  expect(
    app.calls.filter(
      (call) =>
        call.path === "/tutorial/workspace" && call.body?.action === "prepare",
    ),
  ).toEqual([]);
  await prepare.onclick!();
  expect(app.server.workspace.prepared).toEqual(["catalog"]);
  expect(app.root("lesson").textContent).not.toContain(
    "I’ve added the supporting code",
  );
  expect(app.root("lesson").textContent).not.toContain("Apply changes.");
  expect(app.root("lesson").textContent).toContain("Changes applied.");
  expect(
    find(
      app.root("lesson"),
      (element) =>
        element.tag === "button" && element.textContent === "Apply changes",
    ),
  ).toBeUndefined();
  expect(
    app.calls.filter(
      (call) =>
        call.path === "/tutorial/workspace" && call.body?.action === "prepare",
    ),
  ).toHaveLength(1);
  const saved = JSON.parse(app.storage.get("counterfact-coffee-v5")!);
  expect(
    saved.turns.some(
      (turn: { text: string }) => turn.text === "Apply changes.",
    ),
  ).toBe(false);
  saved.turns.push(
    { phaseId: "catalog", role: "you", text: "Apply changes." },
    {
      phaseId: "catalog",
      role: "tutor",
      text: "I’ve added the supporting code. Now it’s your turn.",
    },
  );
  app.storage.set("counterfact-coffee-v5", JSON.stringify(saved));
  const restored = await browser({
    storage: app.storage,
    workspace: true,
    prepared: ["catalog"],
  });
  expect(restored.root("lesson").textContent).not.toContain("Apply changes.");
  expect(restored.root("lesson").textContent).not.toContain(
    "I’ve added the supporting code",
  );
  expect(restored.root("lesson").textContent).toContain("Changes applied.");
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
  expect(order.root("lesson").textContent).toContain(
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
      element.tag === "button" && element.textContent === "Apply changes",
  )!;
  await prepare.onclick!();
  const explanation = PHASES.find(
    (phase) => phase.id === "fail",
  )!.preparation!.replaceAll("`", "");
  app.server.orderMode = "unavailable";
  app.add();
  await app.api.placeOrder();
  await new Promise((resolve) => setImmediate(resolve));
  expect(app.root("lesson").textContent).toContain(explanation);
  await app.acknowledge();
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
  expect(app.root("lesson").textContent).toContain("Changes applied.");
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
  expect(reloaded.root("lesson").textContent).toContain("Changes applied.");
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
  expect(app.root("lesson").textContent).not.toContain(
    "GET /shop/products returned HTTP 200 with 3 products.",
  );
  expect(app.root("lesson").textContent).toContain(
    "HTTP · GET /shop/products → 200",
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
  const failed = history.indexOf("HTTP · POST /shop/orders → 503");
  const retried = history.indexOf("Retried the order: 1 × House Blend.");
  const succeeded = history.indexOf("HTTP · POST /shop/orders → 201");
  expect(history).not.toContain("POST /shop/orders returned HTTP");
  expect(placed).toBeGreaterThan(-1);
  expect(placed).toBeLessThan(failed);
  expect(failed).toBeLessThan(retried);
  expect(retried).toBeLessThan(succeeded);
  expect(history).not.toContain("Refreshed products.");
  const reloaded = await browser({ storage: app.storage });
  expect(
    reloaded
      .root("lesson")
      .textContent.match(/HTTP · POST \/shop\/orders → 503/g),
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
  expect(first.textContent).toContain(
    "GET http://localhost:3100/shop/products",
  );
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
    app.storage.get("counterfact-coffee-v5")!,
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
    "HTTP · POST /shop/orders → 503",
  );
  expect(reloaded.root("lesson").textContent).toContain(
    "HTTP · POST /shop/orders → 201",
  );
});

it("retains malformed and missing responses without inventing an HTTP result", async () => {
  const app = await browser({ phase: "order" });
  app.server.orderMode = "malformed";
  app.add();
  await app.api.placeOrder();
  const malformed = JSON.parse(
    app.storage.get("counterfact-coffee-v5")!,
  ).turns.find((turn: { exchanges?: unknown }) => turn.exchanges);
  expect(malformed.exchanges[0]).toMatchObject({
    status: 201,
    responseText: "{broken JSON",
    error: expect.stringContaining("not valid JSON"),
  });
  app.server.orderMode = "offline";
  await app.api.placeOrder();
  const attempts = JSON.parse(
    app.storage.get("counterfact-coffee-v5")!,
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
  const saved = JSON.parse(app.storage.get("counterfact-coffee-v5")!);
  const refreshes = saved.turns.filter(
    (turn: { text: string }) => turn.text === "Refreshed products.",
  );
  expect(refreshes[0].exchanges[0].responseBody[0].stock).toBe(5);
  expect(refreshes[1].exchanges[0].responseBody[0].stock).toBe(2);
  refreshes[1].exchanges[0].pending = true;
  delete refreshes[1].exchanges[0].status;
  delete refreshes[1].exchanges[0].responseBody;
  delete refreshes[1].exchanges[0].responseText;
  app.storage.set("counterfact-coffee-v5", JSON.stringify(saved));
  const reloaded = await browser({ storage: app.storage });
  expect(reloaded.root("lesson").textContent).toContain(
    "The page reloaded before a response was recorded",
  );
  expect(reloaded.root("lesson").textContent).toContain(
    "HTTP · GET /shop/products → no response",
  );
  expect(
    reloaded.calls.filter((call) => call.path === "/shop/products"),
  ).toHaveLength(1);
});

it.each(PHASES.filter((phase) => phase.check))(
  "ends $id at the edit and waits for a verified save before giving its test action",
  async (phase) => {
    const app = await browser({ phase: phase.id });
    const currentTurns = () =>
      app
        .root("lesson")
        .children.filter(
          (turn) =>
            turn.dataset.phase === phase.id &&
            turn.className === "chat-turn tutor-turn",
        );
    const prompt = currentTurns().at(-1)!;
    const paragraphs = prompt.children.filter((child) => child.tag === "p");
    expect(paragraphs.at(-1)?.textContent).toBe(
      phase.instruction.replaceAll("`", ""),
    );
    expect(
      find(
        prompt,
        (element) => element.tag === "button" && element.textContent === "Okay",
      ),
    ).toBeUndefined();
    const before = app.root("lesson").textContent;
    await app.poll();
    expect(app.root("lesson").textContent).toBe(before);
    app.server.checkOk = true;
    app.server.revision = phase.id + "-saved";
    app.server.workspace.changes.push({
      id: 1,
      actor: "you",
      phaseId: phase.id,
      files: [{ file: phase.edits[0]!.file, before: "old", after: "saved" }],
    });
    await app.poll();
    const nextPrompt = currentTurns().at(-1)!;
    expect(nextPrompt.textContent).toContain(
      phase.verification!.replaceAll("`", ""),
    );
    expect(
      find(
        nextPrompt,
        (element) => element.tag === "button" && element.textContent === "Okay",
      ),
    ).toBeUndefined();
    const after = app.root("lesson").textContent;
    await app.poll();
    expect(app.root("lesson").textContent).toBe(after);
    expect(app.completed()).not.toContain(phase.id);
  },
);

it.each([
  {
    phase: "connect",
    product: "house-blend",
    prompt: "Click Add to cart on House Blend, then click Place order.",
  },
  {
    phase: "decaf",
    product: "decaf",
    prompt:
      "Decaf now shows 5 in the running API. Click Add to cart on Decaf, then click Place order.",
  },
  {
    phase: "restock",
    product: "dark-roast",
    prompt:
      "Dark Roast now has 5 bags, so buying one should leave 4. Click Add to cart on Dark Roast once, then click Place order.",
  },
])(
  "waits for the $phase refresh before asking for its order",
  async ({ phase, product, prompt }) => {
    const app = await browser({ phase, checkOk: true });
    const currentText = () =>
      app
        .root("lesson")
        .children.filter((turn) => turn.dataset.phase === phase)
        .map((turn) => turn.textContent)
        .join(" ");
    expect(currentText()).not.toContain(prompt);
    await app.poll();
    expect(currentText()).not.toContain(prompt);
    app.server.products.find((item) => item.id === product)!.stock = 5;
    await app.click("refresh-products");
    expect(currentText()).toContain(prompt);
    await app.click("refresh-products");
    expect(currentText().split(prompt)).toHaveLength(2);
    expect(app.completed()).not.toContain(phase);
  },
);

it("waits for opening the demo folder before asking to refresh products", async () => {
  const app = await browser({ acknowledge: false });
  for (let step = 0; step < 20; step++) {
    const okay = find(
      app.root("lesson"),
      (element) => element.tag === "button" && element.textContent === "Okay",
    );
    if (!okay) break;
    await okay.onclick!();
  }
  const opened = find(
    app.root("lesson"),
    (element) =>
      element.tag === "button" && element.textContent === "Folder is open",
  )!;
  expect(opened).toBeDefined();
  expect(app.root("lesson").textContent).not.toContain(
    "Click Refresh products and compare",
  );
  const before = app.root("lesson").textContent;
  await app.poll(false);
  expect(app.root("lesson").textContent).toBe(before);
  await opened.onclick!();
  expect(app.root("lesson").textContent).toContain(
    "Click Refresh products and compare the products and the actual response in your chat bubble.",
  );
  expect(
    find(
      app.root("lesson"),
      (element) => element.tag === "button" && element.textContent === "Okay",
    ),
  ).toBeUndefined();
});

it("explains nonsensical descriptions after exploration and makes lesson three about description examples", async () => {
  const app = await browser();
  expect(app.root("lesson").textContent).not.toContain(
    "At this point Counterfact",
  );
  await app.click("refresh-products");
  expect(app.root("lesson").textContent).toContain(
    "The returned products follow the shapes described in openapi.yaml.",
  );
  expect(app.root("lesson").textContent).toContain(
    "At this point Counterfact doesn't know anything about the description field except that it's a string, so it's generating random, nonsensical strings. Let's fix that.",
  );
  await app.click("continue");
  expect(app.root("lesson").textContent).toContain(
    "Give generated descriptions coffee examples",
  );
  expect(app.root("lesson").textContent).toContain(
    "components.schemas.Product.properties.description.examples",
  );
  expect(app.root("lesson").textContent).not.toContain(
    "an example value of House Blend",
  );
});

it("keeps the name-example lesson in existing version 4 pages", () => {
  const page = coffeeShopPage("/tmp/demo", 4);
  expect(page).toContain('"id":"name-example"');
  expect(page).not.toContain('"id":"description-example"');
  expect(coffeeShopPage("/tmp/demo")).toContain('"id":"description-example"');
});

it("keeps order diagnostics in chat and customer feedback in the store", async () => {
  const app = await browser({ phase: "orientation" });
  app.add();
  await app.click("checkout");
  expect(app.root("shop-notice").textContent).toBe(
    "Thanks! Your order has been placed.",
  );
  expect(app.root("lesson").textContent).toContain(
    "HTTP · POST /shop/orders → 201",
  );
  app.server.orderMode = "offline";
  app.add();
  await app.click("checkout");
  expect(app.root("shop-notice").textContent).toBe(
    "We couldn’t place your order. Your cart has been kept.",
  );
  expect(app.root("shop-notice").textContent).not.toMatch(
    /HTTP|API|chat|response/iu,
  );
  expect(app.root("lesson").textContent).toContain(
    "The order has no usable confirmation",
  );
});

it("describes an empty storefront without API inspection instructions", async () => {
  const app = await browser({ products: [] });
  expect(app.root("products").textContent).toBe(
    "No coffees are available right now.",
  );
});

it("keeps completion feedback only in Milo’s conversation without a separate Update area", async () => {
  const app = await browser({ phase: "orientation" });
  expect(coffeeShopPage("/tmp/demo")).not.toContain("guide-status");
  app.add();
  await app.click("checkout");
  expect(
    app
      .root("lesson")
      .textContent.match(
        /You’ve tried the shop and seen its request and response in the conversation/g,
      ),
  ).toHaveLength(1);
  expect(app.root("save-check").textContent).toBe("");
  expect(app.root("continue").hidden).toBe(false);
});
