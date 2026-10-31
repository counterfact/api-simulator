import type { LessonInput } from "./runtime.js";
import { StateGraph, START, END } from "@langchain/langgraph";
import type { LessonPhase } from "../coffee-shop-lessons.js";
import { LessonState, explain, complete, checkSaved } from "./runtime.js";

export const lesson: LessonPhase = {
  id: "context-repl",
  lesson: 8,
  title: "Connect routes and the REPL",
  explanation:
    "Your handlers now use the shared object you can access as `context` at the terminal’s ⬣> prompt. A change there affects the next request without editing or restarting a route.",
  instruction:
    "In the REPL, add one coffee with ID practice-coffee to `context.catalog` and give it a quantity of 5 in `context.inventory`, then click Refresh products.",
  hint: "At the ⬣> prompt in the terminal running Counterfact, use the `push` method on `context.catalog` to add one object. Give it `id` practice-coffee, `name` Practice Coffee, `description` Chocolate and caramel, and `price` 1400. Stock belongs separately in `context.inventory`: assign 5 to its practice-coffee entry. Press Enter after each expression, then click Refresh products in the browser.",
  edits: [],
};

export const graph = new StateGraph(LessonState)
  .addNode("milo_explains", explain(lesson))
  .addNode("learner_adds_practice_coffee", ({ input }) => ({
    prompt: {
      text: lesson.instruction,
      hint: practiceSetupHint(input),
      action: "experiment",
    },
  }))
  .addNode("wait_for_connected_routes", async (state, config) => {
    const update = await checkSaved(lesson)(state, config);
    if (!(update.input ?? state.input).ready)
      return {
        ...update,
        prompt: {
          text: lesson.instruction,
          hint: "In routes/products.ts, use `$.context.listProducts()` as the JSON response. In routes/orders.ts, use `$.context.confirmOrder` with the incoming items and return its result as JSON. Keep the 503 branch and save both files.",
          action: "save",
        },
      };
    return update;
  })
  .addNode("observe_practice_coffee", ({ input }) => {
    return {
      satisfied:
        input.ready &&
        input.event === "products" &&
        input.source === "manual" &&
        input.products.length === 1 &&
        input.products[0]?.id === "practice-coffee" &&
        input.products[0]?.stock === 5 &&
        input.state.inventory?.["practice-coffee"] === 5 &&
        Array.isArray(input.state.catalog) &&
        input.state.catalog.length === 1,
      effect: {
        completionMessage:
          "The shop read the coffee and stock you added through the REPL. Routes and the REPL share this same running context.",
      },
    };
  })
  .addNode("lesson_complete", complete)
  .addEdge(START, "milo_explains")
  .addEdge("milo_explains", "learner_adds_practice_coffee")
  .addEdge("learner_adds_practice_coffee", "wait_for_connected_routes")
  .addConditionalEdges(
    "wait_for_connected_routes",
    ({ input }) => (input.ready ? "observe_practice_coffee" : END),
    ["observe_practice_coffee", END],
  )
  .addConditionalEdges(
    "observe_practice_coffee",
    ({ satisfied }) => (satisfied ? "lesson_complete" : END),
    ["lesson_complete", END],
  )
  .addEdge("lesson_complete", END)
  .compile();

export function practiceSetupHint(input: LessonInput) {
  const catalog = input.state.catalog;
  if (!Array.isArray(catalog) || catalog.length === 0)
    return lesson.hint ?? lesson.instruction;
  const practiceIndex = catalog.findIndex(
    (coffee) => coffee?.id === "practice-coffee",
  );
  const keep = practiceIndex < 0 ? 0 : practiceIndex;
  const extras = catalog
    .map((_, index) => index)
    .filter((index) => index !== keep)
    .reverse();
  if (extras.length)
    return (
      "Your running catalog has " +
      catalog.length +
      " entries; this exercise needs one. Keep the coffee at zero-based index " +
      keep +
      ". In the REPL, use the `splice` method on `context.catalog` to remove the extra entries at indices " +
      extras.join(", ") +
      " in that order. For each removal, pass its index and a count of 1. Then click Refresh products."
    );
  const coffee = catalog[0];
  if (
    practiceIndex < 0 ||
    typeof coffee?.name !== "string" ||
    typeof coffee?.description !== "string" ||
    !Number.isInteger(coffee?.price) ||
    coffee.price < 500 ||
    coffee.price > 2500
  )
    return "A coffee already exists in `context.catalog`; edit that entry instead of appending another. At the REPL, update the object at index 0: its `id` should be practice-coffee, `name` Practice Coffee, `description` Chocolate and caramel, and numeric `price` 1400. Then click Refresh products.";
  if (input.state.inventory?.["practice-coffee"] !== 5)
    return "The practice coffee already exists. In the REPL, assign 5 to the practice-coffee entry in `context.inventory`, then click Refresh products.";
  return "The practice coffee and its stock are already in the running context. Click Refresh products to observe them through the shop.";
}
