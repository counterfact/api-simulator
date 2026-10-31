import { StateGraph, START, END } from "@langchain/langgraph";
import type { LessonPhase } from "../coffee-shop-lessons.js";
import {
  LessonState,
  checkSaved,
  explain,
  instruct,
  propose,
  apply,
  verified,
  complete,
} from "./runtime.js";

export const lesson: LessonPhase = {
  id: "fail",
  verification:
    "Your saved handler now produces a 503 response when the switch is off, so an order should fail and stay in the cart. In the shop, click Add to cart on House Blend, then click Place order.",
  preparation:
    "Add `ordersAvailable = true` and the HTTP 503 branch above the existing successful response.",
  lesson: 6,
  title: "Add failure and recovery",
  explanation:
    "Your handler chooses the response status and body. A switch lets it produce a repeatable 503 response from the same endpoint.",
  instruction:
    "In routes/orders.ts, inspect the new 503 branch, change `ordersAvailable` to `false`, and save.",
  edits: [
    {
      file: "routes/orders.ts",
      instruction:
        "Use the existing switch to exercise the unavailable response.",
    },
  ],
  check: true,
  hint: "In routes/orders.ts, locate the existing `ordersAvailable` constant above POST. Change its value from `true` to `false`, preserving the supplied 503 branch and success response, then save.",
  verificationHint:
    "Click Add to cart on House Blend once, then click Place order. Your handler’s existing switch should select the unavailable response and preserve the cart.",
};

export const graph = new StateGraph(LessonState)
  .addNode("milo_explains", explain(lesson))
  .addNode("milo_proposes_fail_support", propose(lesson))
  .addNode("wait_for_approval", () => ({}))
  .addNode("milo_prepares_fail_support", apply(lesson))
  .addNode("learner_disables_orders", instruct(lesson))
  .addNode("verify_saved_fail", checkSaved(lesson))
  .addNode("milo_invites_experiment", verified(lesson))
  .addNode("observe_unavailable_response", ({ input }) => {
    return { satisfied: input.event === "order" && input.status === 503 };
  })
  .addNode("lesson_complete", complete)
  .addEdge(START, "milo_explains")
  .addEdge("milo_explains", "milo_proposes_fail_support")
  .addEdge("milo_proposes_fail_support", "wait_for_approval")
  .addConditionalEdges(
    "wait_for_approval",
    ({ input }) =>
      input.prepared || input.event === "prepare" || input.event === "check"
        ? "milo_prepares_fail_support"
        : END,
    ["milo_prepares_fail_support", END],
  )
  .addConditionalEdges(
    "milo_prepares_fail_support",
    ({ input }) =>
      input.event !== "prepare" || input.prepared
        ? "learner_disables_orders"
        : END,
    ["learner_disables_orders", END],
  )
  .addEdge("learner_disables_orders", "verify_saved_fail")
  .addConditionalEdges(
    "verify_saved_fail",
    ({ input }) => (input.ready ? "milo_invites_experiment" : END),
    ["milo_invites_experiment", END],
  )
  .addEdge("milo_invites_experiment", "observe_unavailable_response")
  .addConditionalEdges(
    "observe_unavailable_response",
    ({ satisfied }) => (satisfied ? "lesson_complete" : END),
    ["lesson_complete", END],
  )
  .addEdge("lesson_complete", END)
  .compile();
