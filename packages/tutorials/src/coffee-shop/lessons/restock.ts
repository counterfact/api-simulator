import { StateGraph, START, END } from "@langchain/langgraph";
import type { LessonPhase } from "../coffee-shop-lessons.js";
import {
  LessonState,
  explain,
  instruct,
  complete,
  stock,
  purchaseObservation,
} from "./runtime.js";

export const lesson: LessonPhase = {
  id: "restock",
  lesson: 13,
  title: "Exercise evolving state",
  explanation:
    "Changing context through the REPL affects the same state that your order handler updates.",
  instruction:
    "Set Dark Roast inventory to 5 in the terminal’s REPL, then click Refresh products in the browser.",
  edits: [],
  hint: "In the terminal’s REPL, assign the number 5 to the `dark-roast` entry in `context.inventory` and press Enter. Return to the shop and click Refresh products.",
};

export const graph = new StateGraph(LessonState)
  .addNode("milo_explains", explain(lesson))
  .addNode("learner_restocks_in_repl", instruct(lesson))
  .addNode("observe_restock_and_purchase", ({ input }) => {
    if (
      input.event === "products" &&
      input.source === "manual" &&
      stock(input)["dark-roast"] === 5
    )
      return {
        satisfied: false,
        effect: {
          replies: [
            {
              text: "Dark Roast now has 5 bags, so buying one should leave 4. Click Add to cart on Dark Roast once, then click Place order.",
              hint: "On the Dark Roast card showing 5 bags, click Add to cart once, then click Place order in the cart.",
              waitForAction: true,
              unique: true,
            },
          ],
        },
      };
    const observed = purchaseObservation(input);
    return {
      satisfied:
        !!observed &&
        observed.before === 5 &&
        observed.quantity === 1 &&
        observed.after === 4,
    };
  })
  .addNode("lesson_complete", complete)
  .addEdge(START, "milo_explains")
  .addEdge("milo_explains", "learner_restocks_in_repl")
  .addEdge("learner_restocks_in_repl", "observe_restock_and_purchase")
  .addConditionalEdges(
    "observe_restock_and_purchase",
    ({ satisfied }) => (satisfied ? "lesson_complete" : END),
    ["lesson_complete", END],
  )
  .addEdge("lesson_complete", END)
  .compile();
