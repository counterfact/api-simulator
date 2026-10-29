import { expect, it } from "@jest/globals";
import {
  curriculum,
  observeLesson,
  runLessonOperation,
} from "../../src/coffee-shop/coffee-shop-curriculum.js";
import { emptyInput } from "../../src/coffee-shop/lessons/runtime.js";
import { CATALOG } from "../../src/coffee-shop/coffee-shop-lessons.js";

const catalog = () => ({
  ...emptyInput(),
  event: "products" as const,
  source: "manual",
  prepared: true,
  ready: true,
  products: CATALOG,
  baseline: CATALOG,
  state: {
    catalog: CATALOG,
    inventory: { "house-blend": 5, "dark-roast": 3, decaf: 0 },
  },
});

it("requires approval, a verified save, and two matching explicit responses for the catalog", async () => {
  const input = catalog();
  input.catalogReads = 1;
  input.lastCatalog = JSON.stringify(CATALOG);
  expect(
    (await observeLesson("catalog", { ...input, prepared: false })).complete,
  ).not.toBe(true);
  expect(
    (await observeLesson("catalog", { ...input, ready: false })).complete,
  ).not.toBe(true);
  expect(
    (await observeLesson("catalog", { ...input, source: "initial" })).complete,
  ).not.toBe(true);
  expect(
    (
      await observeLesson("catalog", {
        ...input,
        products: CATALOG.map((product) => ({
          ...product,
          price: product.price + 1,
        })),
      })
    ).complete,
  ).not.toBe(true);
  expect((await observeLesson("catalog", input)).complete).toBe(true);
});

it("asks for the second catalog response without performing a request or earning completion", async () => {
  const first = await observeLesson("catalog", catalog());
  expect(first.catalogReads).toBe(1);
  expect(first.replies?.[0]).toMatchObject({ waitForAction: true });
  expect(first.replies?.[0]?.text).toContain("Refresh products once more");
  expect(first.complete).not.toBe(true);
});

it("keeps correct context methods independent of exploratory live data", async () => {
  const input = { ...catalog(), event: "poll" as const };
  expect((await observeLesson("context", input)).complete).toBe(true);
  expect(input.state.inventory).toEqual({
    "house-blend": 5,
    "dark-roast": 3,
    decaf: 0,
  });
});

it("does not credit a stock scalar as the full reset baseline", async () => {
  const input = {
    ...catalog(),
    event: "poll" as const,
    entryState: {
      catalog: [{ id: "practice-coffee" }],
      inventory: { "practice-coffee": 5 },
    },
    state: {
      catalog: [{ id: "practice-coffee" }],
      inventory: { "practice-coffee": 5, "dark-roast": 3 },
    },
  };
  const incomplete = await observeLesson("seed", input);
  expect(incomplete.complete).not.toBe(true);
  expect(incomplete.hint).toContain("does not yet match reset’s baseline");
  expect(
    (await observeLesson("seed", { ...input, state: catalog().state }))
      .complete,
  ).toBe(true);
});

it("requires a failed request with shortages, then a separate cleanup observation", async () => {
  const input = {
    ...catalog(),
    event: "order" as const,
    status: 409,
    response: { shortages: [{ requested: 2, available: 1 }] },
  };
  const rejected = await observeLesson("rules", input);
  expect(rejected.rejectionSeen).toBe(true);
  expect(rejected.complete).not.toBe(true);
  expect(rejected.replies?.[0]?.text).toContain("Click Empty cart");
  expect(
    (
      await observeLesson("rules", {
        ...catalog(),
        rejectionSeen: true,
        cartSize: 1,
      })
    ).complete,
  ).not.toBe(true);
  expect(
    (
      await observeLesson("rules", {
        ...catalog(),
        rejectionSeen: true,
        cartSize: 0,
      })
    ).complete,
  ).toBe(true);
});

it("separates an observed purchase from answering the inventory question", async () => {
  const input = {
    ...catalog(),
    event: "order" as const,
    status: 201,
    before: { "dark-roast": 3 },
    items: [{ productId: "dark-roast", quantity: 1 }],
    response: { orderId: 1, items: [{ productId: "dark-roast", quantity: 1 }] },
  };
  const observed = await observeLesson("observe", input);
  expect(observed.observation).toEqual({ before: 3, after: 3, quantity: 1 });
  expect(observed.complete).not.toBe(true);
  expect(
    (
      await observeLesson("observe", {
        ...input,
        event: "answer",
        observation: observed.observation,
        answer: true,
      })
    ).quizWrong,
  ).toBe(true);
  expect(
    (
      await observeLesson("observe", {
        ...input,
        event: "answer",
        observation: observed.observation,
        answer: false,
      })
    ).complete,
  ).toBe(true);
});

it("waits for the original failed items before crediting recovery", async () => {
  const items = [{ productId: "house-blend", quantity: 1 }];
  const input = {
    ...catalog(),
    event: "order" as const,
    status: 201,
    items,
    response: { orderId: 1, items },
  };
  expect(
    (
      await observeLesson("retry", {
        ...input,
        original: [{ productId: "decaf", quantity: 1 }],
      })
    ).complete,
  ).not.toBe(true);
  expect(
    (await observeLesson("retry", { ...input, original: items })).complete,
  ).toBe(true);
});

it("invokes Milo's edit tool only for the approved action", async () => {
  const calls: string[] = [];
  const result = { ok: true, message: "Done", revision: "reviewed" };
  const operations = {
    preview: async () => {
      calls.push("preview");
      return result;
    },
    prepare: async (_id: string, revision?: string) => {
      calls.push("apply:" + revision);
      return result;
    },
    check: async () => {
      calls.push("check");
      return result;
    },
  };
  await runLessonOperation("catalog", "preview", operations);
  expect(calls).toEqual(["preview"]);
  await observeLesson("catalog", {
    ...catalog(),
    event: "poll",
    announceSave: true,
  });
  expect(calls).toEqual(["preview"]);
  await runLessonOperation("catalog", "prepare", operations, "reviewed");
  expect(calls).toEqual(["preview", "apply:reviewed"]);
  await runLessonOperation("catalog", "check", operations);
  expect(calls).toEqual(["preview", "apply:reviewed", "check"]);
});

it("exposes the real actor steps and conditional wait edges in the graph diagram", async () => {
  const phase = curriculum.find((phase) => phase.lesson.id === "catalog")!;
  const diagram = (await phase.graph.getGraphAsync()).drawMermaid();
  for (const name of [
    "milo_proposes_catalog",
    "wait_for_approval",
    "milo_adds_catalog",
    "learner_replaces_random_response",
    "verify_catalog_handler",
    "compare_catalog_responses",
    "milo_requests_second_refresh",
  ])
    expect(diagram).toContain(name);
  expect(diagram).toContain("__end__");
});
