import { StateGraph, START, END } from "@langchain/langgraph";
import type { LessonPhase } from "../coffee-shop-lessons.js";
import {
  LessonState,
  checkSaved,
  explain,
  instruct,
  verified,
  complete,
  accepted,
} from "./runtime.js";

export const lesson: LessonPhase = {
  id: "order",
  verification:
    "Nice work! Your saved handler now builds its confirmation from the submitted items. In the shop, click Add to cart on House Blend, then click Place order.",
  lesson: 5,
  title: "Respond to the order you received",
  explanation:
    "`$.body` is the incoming request body. Returning its items connects the confirmation to your cart. A response by itself changes no inventory.",
  instruction:
    "The fixed order ID is temporary, and the existing status stays 201. In routes/orders.ts, replace `.random()` with a JSON response containing an `orderId` of 1 and an `items` property taken from the incoming request body, then save.",
  edits: [
    {
      file: "routes/orders.ts",
      instruction:
        "Return the submitted items rather than generating new ones.",
    },
  ],
  check: true,
  hint: "In routes/orders.ts, keep the 201 status. Replace the random response with a JSON response containing two properties: `orderId` with the number 1, and `items` with the submitted array from `$.body.items`. Save the file.",
  verificationHint:
    "Click Add to cart on House Blend once, then click Place order in the cart.",
};

export const graph = new StateGraph(LessonState)
  .addNode("milo_explains", explain(lesson))
  .addNode("learner_returns_submitted_items", instruct(lesson))
  .addNode("verify_saved_order", checkSaved(lesson))
  .addNode("milo_invites_experiment", verified(lesson))
  .addNode("observe_submitted_items", ({ input }) => {
    return { satisfied: accepted(input) };
  })
  .addNode("lesson_complete", complete)
  .addEdge(START, "milo_explains")
  .addEdge("milo_explains", "learner_returns_submitted_items")
  .addEdge("learner_returns_submitted_items", "verify_saved_order")
  .addConditionalEdges(
    "verify_saved_order",
    ({ input }) => (input.ready ? "milo_invites_experiment" : END),
    ["milo_invites_experiment", END],
  )
  .addEdge("milo_invites_experiment", "observe_submitted_items")
  .addConditionalEdges(
    "observe_submitted_items",
    ({ satisfied }) => (satisfied ? "lesson_complete" : END),
    ["lesson_complete", END],
  )
  .addEdge("lesson_complete", END)
  .compile();
