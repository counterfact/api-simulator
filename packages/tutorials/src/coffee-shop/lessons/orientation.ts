import { StateGraph, START, END } from "@langchain/langgraph";
import type { LessonPhase } from "../coffee-shop-lessons.js";
import { LessonState, explain, instruct, complete } from "./runtime.js";

export const lesson: LessonPhase = {
  id: "orientation",
  lesson: 1,
  title: "Try the coffee shop",
  explanation:
    "Let’s get comfortable with the tutorial before editing code. The coffee shop on the right sends requests to the simulated shop API; our conversation on the left shows what happened.",
  instruction:
    "Click Add to cart on any coffee with stock, then click Place order.",
  edits: [],
  hint: "Choose a coffee card showing at least one bag available. Click its Add to cart button once. Your cart will show one bag and a total; click Place order.",
};

export const graph = new StateGraph(LessonState)
  .addNode("milo_explains", explain(lesson))
  .addNode("learner_places_first_order", instruct(lesson))
  .addNode("observe_first_order", ({ input }) => {
    return {
      satisfied:
        input.event === "order" &&
        input.status === 201 &&
        Number.isInteger(input.response?.orderId),
      effect: {
        started: true,
        completionMessage:
          "You’ve tried the shop and seen its request and response in the conversation. Next we’ll inspect the API that produced them.",
      },
    };
  })
  .addNode("lesson_complete", complete)
  .addEdge(START, "milo_explains")
  .addEdge("milo_explains", "learner_places_first_order")
  .addEdge("learner_places_first_order", "observe_first_order")
  .addConditionalEdges(
    "observe_first_order",
    ({ satisfied }) => (satisfied ? "lesson_complete" : END),
    ["lesson_complete", END],
  )
  .addEdge("lesson_complete", END)
  .compile();
