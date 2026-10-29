import { StateGraph, START, END } from "@langchain/langgraph";
import type { LessonPhase } from "../coffee-shop-lessons.js";
import { LessonState, explain, instruct, complete, stock } from "./runtime.js";

export const lesson: LessonPhase = {
  id: "sellout",
  lesson: 13,
  title: "Exercise evolving state",
  explanation:
    "The same handlers produce in-stock and sold-out responses. Requests change shared inventory; subsequent requests read the updated value.",
  instruction:
    "Buying the remaining bags should bring stock to zero and make the shop show Sold out. Click Add to cart on Dark Roast until the cart contains all its remaining bags, then click Place order.",
  edits: [],
  hint: "Read Dark Roast’s remaining stock. Use its Add to cart button until the cart contains exactly that many bags, then click Place order.",
};

export const graph = new StateGraph(LessonState)
  .addNode("milo_explains", explain(lesson))
  .addNode("learner_buys_remaining_stock", instruct(lesson))
  .addNode("observe_sold_out", ({ input }) => {
    return {
      satisfied: input.event === "products" && stock(input)["dark-roast"] === 0,
    };
  })
  .addNode("lesson_complete", complete)
  .addEdge(START, "milo_explains")
  .addEdge("milo_explains", "learner_buys_remaining_stock")
  .addEdge("learner_buys_remaining_stock", "observe_sold_out")
  .addConditionalEdges(
    "observe_sold_out",
    ({ satisfied }) => (satisfied ? "lesson_complete" : END),
    ["lesson_complete", END],
  )
  .addEdge("lesson_complete", END)
  .compile();
