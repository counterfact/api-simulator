import { StateGraph, START, END } from "@langchain/langgraph";
import type { LessonPhase } from "../coffee-shop-lessons.js";
import {
  LessonState,
  checkSaved,
  explain,
  instruct,
  verified,
  complete,
  equal,
  accepted,
} from "./runtime.js";

export const lesson: LessonPhase = {
  id: "retry",
  verification:
    "Your saved handler can accept orders again. A successful response should be 201 and clear the cart. With the original failed items in your cart, click Try again.",
  lesson: 6,
  title: "Add failure and recovery",
  explanation:
    "The preserved cart lets you repeat the same request after changing the handler. Saving replaces the route implementation in the running server.",
  instruction: "Change `ordersAvailable` to `true` and save.",
  edits: [
    {
      file: "routes/orders.ts",
      instruction: "Restore ordering.",
    },
  ],
  check: true,
  hint: "In routes/orders.ts, change the existing `ordersAvailable` constant back to `true` and save. Keep the failed order’s cart intact.",
  verificationHint:
    "Keep the same items as the failed order. If you changed the cart, use Restore original cart in the chat. Click Try again in the shop.",
};

export const graph = new StateGraph(LessonState)
  .addNode("milo_explains", explain(lesson))
  .addNode("learner_restores_orders", instruct(lesson))
  .addNode("verify_saved_retry", checkSaved(lesson))
  .addNode("milo_invites_experiment", verified(lesson))
  .addNode("observe_same_cart_recovery", ({ input }) => {
    return { satisfied: accepted(input) && equal(input.original, input.items) };
  })
  .addNode("lesson_complete", complete)
  .addEdge(START, "milo_explains")
  .addEdge("milo_explains", "learner_restores_orders")
  .addEdge("learner_restores_orders", "verify_saved_retry")
  .addConditionalEdges(
    "verify_saved_retry",
    ({ input }) => (input.ready ? "milo_invites_experiment" : END),
    ["milo_invites_experiment", END],
  )
  .addEdge("milo_invites_experiment", "observe_same_cart_recovery")
  .addConditionalEdges(
    "observe_same_cart_recovery",
    ({ satisfied }) => (satisfied ? "lesson_complete" : END),
    ["lesson_complete", END],
  )
  .addEdge("lesson_complete", END)
  .compile();
