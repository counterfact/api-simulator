import { StateGraph, START, END } from "@langchain/langgraph";
import type { LessonPhase } from "../coffee-shop-lessons.js";
import {
  LessonState,
  explain,
  instruct,
  complete,
  stock,
  accepted,
} from "./runtime.js";

export const lesson: LessonPhase = {
  id: "decaf",
  lesson: 10,
  title: "Change the running state",
  explanation:
    "The REPL’s context is the same instance the HTTP handlers use as `$.context`. Assigning a quantity changes the next product response without editing or restarting a handler.",
  instruction:
    "Set Decaf inventory to 5 in the terminal’s REPL, then click Refresh products in the browser.",
  edits: [],
  hint: "At the terminal’s ⬣> prompt, assign the number 5 to the `decaf` entry in `context.inventory` and press Enter. Return to the browser and click Refresh products.",
};

export const graph = new StateGraph(LessonState)
  .addNode("milo_explains", explain(lesson))
  .addNode("learner_changes_decaf_stock", instruct(lesson))
  .addNode("observe_decaf_purchase", ({ input }) => {
    if (
      input.event === "products" &&
      input.source === "manual" &&
      stock(input).decaf === 5
    )
      return {
        satisfied: false,
        effect: {
          replies: [
            {
              text: "Decaf now shows 5 in the running API. Click Add to cart on Decaf, then click Place order.",
              hint: "On the Decaf card showing 5 bags, click Add to cart once, then click Place order in the cart.",
              waitForAction: true,
              unique: true,
            },
          ],
        },
      };
    return {
      satisfied:
        accepted(input) &&
        !!input.items?.some((item) => item.productId === "decaf") &&
        stock(input).decaf! > 0,
    };
  })
  .addNode("lesson_complete", complete)
  .addEdge(START, "milo_explains")
  .addEdge("milo_explains", "learner_changes_decaf_stock")
  .addEdge("learner_changes_decaf_stock", "observe_decaf_purchase")
  .addConditionalEdges(
    "observe_decaf_purchase",
    ({ satisfied }) => (satisfied ? "lesson_complete" : END),
    ["lesson_complete", END],
  )
  .addEdge("lesson_complete", END)
  .compile();
