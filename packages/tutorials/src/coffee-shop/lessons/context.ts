import { StateGraph, START, END } from "@langchain/langgraph";
import type { LessonPhase } from "../coffee-shop-lessons.js";
import {
  LessonState,
  checkSaved,
  explain,
  instruct,
  propose,
  apply,
  complete,
} from "./runtime.js";

export const lesson: LessonPhase = {
  id: "context",
  verification:
    "Great job! Your context methods combine product descriptions with stock and give each confirmation a successive order ID. The fields start empty in a fresh context; data you’ve added to this running session is kept.",
  preparation:
    "Add empty `catalog` and `inventory` fields, the order counter, and two method stubs to routes/_.context.ts. `Product` and `OrderItem` select their matching OpenAPI types from `Schemas`, imported through `types/index.ts`. The `Product[]` return type on `listProducts` lets your editor check that each returned coffee includes `stock`.",
  lesson: 7,
  title: "Introduce shared context",
  explanation:
    "Counterfact creates one running `Context` instance for these routes. Fields hold state; methods are ordinary TypeScript that you write. `catalog` contains product descriptions, `inventory` holds quantities by ID, and `nextOrderId` supplies successive confirmations.",
  instruction:
    "The collections in routes/_.context.ts start empty, and the handlers still use their earlier responses until you connect them. Implement `listProducts` to return each catalog product with stock read from inventory by product ID, using zero for a missing entry. Implement `confirmOrder` to return the supplied items and current `nextOrderId`, advancing the counter for the next confirmation, then save the file.",
  edits: [
    {
      file: "routes/_.context.ts",
      instruction:
        "Implement both method bodies while keeping the collections initially empty.",
    },
  ],
  check: true,
  hint: "In routes/_.context.ts, `listProducts` returns `Product[]`. Use the catalog array’s `map` method to create a new object for each coffee: copy its existing properties and add a property named `stock`, looked up in inventory using the coffee’s ID. Use zero for a missing entry. In `confirmOrder`, return the supplied items and the current order counter, advancing the counter once for the next call. Keep the catalog and inventory field initializers empty in the file, then save.",
};

export const graph = new StateGraph(LessonState)
  .addNode("milo_explains", explain(lesson))
  .addNode("milo_proposes_context_support", propose(lesson))
  .addNode("wait_for_approval", () => ({}))
  .addNode("milo_prepares_context_support", apply(lesson))
  .addNode("learner_implements_context_methods", instruct(lesson))
  .addNode("verify_saved_context", checkSaved(lesson))
  .addNode("verify_context_methods", ({ input }) => {
    return {
      satisfied: input.event === "poll",
      effect: { completionMessage: lesson.verification },
    };
  })
  .addNode("lesson_complete", complete)
  .addEdge(START, "milo_explains")
  .addEdge("milo_explains", "milo_proposes_context_support")
  .addEdge("milo_proposes_context_support", "wait_for_approval")
  .addConditionalEdges(
    "wait_for_approval",
    ({ input }) =>
      input.prepared || input.event === "prepare" || input.event === "check"
        ? "milo_prepares_context_support"
        : END,
    ["milo_prepares_context_support", END],
  )
  .addConditionalEdges(
    "milo_prepares_context_support",
    ({ input }) =>
      input.event !== "prepare" || input.prepared
        ? "learner_implements_context_methods"
        : END,
    ["learner_implements_context_methods", END],
  )
  .addEdge("learner_implements_context_methods", "verify_saved_context")
  .addConditionalEdges(
    "verify_saved_context",
    ({ input }) => (input.ready ? "verify_context_methods" : END),
    ["verify_context_methods", END],
  )
  .addConditionalEdges(
    "verify_context_methods",
    ({ satisfied }) => (satisfied ? "lesson_complete" : END),
    ["lesson_complete", END],
  )
  .addEdge("lesson_complete", END)
  .compile();
