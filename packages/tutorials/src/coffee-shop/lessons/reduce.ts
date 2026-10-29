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
  purchaseObservation,
} from "./runtime.js";

export const lesson: LessonPhase = {
  id: "reduce",
  verification:
    "Great job! Your saved order handler now subtracts purchased quantities from inventory, so buying one bag should lower its stock by one. Note Dark Roast’s stock, click its Add to cart button once, then click Place order.",
  preparation:
    "Import the generated `OrderItem` type, add an empty `reduceInventory(items, inventory)` helper, and call it after stock validation, before confirming the order. Its TODO does nothing until you implement the loop.",
  lesson: 12,
  title: "Make purchases reduce inventory",
  explanation:
    "An order confirmation and an inventory change are separate operations. The new helper receives the ordered items and the same inventory object read by the product handler.",
  instruction:
    "The helper in routes/orders.ts receives the shared inventory object, so mutating it changes what the next request sees. Implement `reduceInventory` to visit every ordered item and subtract its quantity from inventory under its product ID, then save the file.",
  edits: [
    {
      file: "routes/orders.ts",
      instruction:
        "Implement the helper’s body; keep its existing call after stock validation.",
    },
  ],
  check: true,
  hint: "In routes/orders.ts, find the TODO inside `reduceInventory`. Loop over every item in the supplied items array. Use each item’s product ID to find its entry in the supplied inventory object, and subtract that item’s quantity from that entry. Change the supplied inventory itself; keep the helper’s existing call after validation. Save the file.",
  verificationHint:
    "Note Dark Roast’s displayed stock, add one bag of Dark Roast to your cart, then click Place order.",
};

export const graph = new StateGraph(LessonState)
  .addNode("milo_explains", explain(lesson))
  .addNode("milo_proposes_reduce_support", propose(lesson))
  .addNode("wait_for_approval", () => ({}))
  .addNode("milo_prepares_reduce_support", apply(lesson))
  .addNode("learner_implements_inventory_mutation", instruct(lesson))
  .addNode("verify_saved_reduce", checkSaved(lesson))
  .addNode("milo_invites_experiment", verified(lesson))
  .addNode("observe_inventory_reduction", ({ input }) => {
    const observed = purchaseObservation(input);
    return {
      satisfied:
        !!observed && observed.after === observed.before - observed.quantity,
    };
  })
  .addNode("lesson_complete", complete)
  .addEdge(START, "milo_explains")
  .addEdge("milo_explains", "milo_proposes_reduce_support")
  .addEdge("milo_proposes_reduce_support", "wait_for_approval")
  .addConditionalEdges(
    "wait_for_approval",
    ({ input }) =>
      input.prepared || input.event === "prepare" || input.event === "check"
        ? "milo_prepares_reduce_support"
        : END,
    ["milo_prepares_reduce_support", END],
  )
  .addConditionalEdges(
    "milo_prepares_reduce_support",
    ({ input }) =>
      input.event !== "prepare" || input.prepared
        ? "learner_implements_inventory_mutation"
        : END,
    ["learner_implements_inventory_mutation", END],
  )
  .addEdge("learner_implements_inventory_mutation", "verify_saved_reduce")
  .addConditionalEdges(
    "verify_saved_reduce",
    ({ input }) => (input.ready ? "milo_invites_experiment" : END),
    ["milo_invites_experiment", END],
  )
  .addEdge("milo_invites_experiment", "observe_inventory_reduction")
  .addConditionalEdges(
    "observe_inventory_reduction",
    ({ satisfied }) => (satisfied ? "lesson_complete" : END),
    ["lesson_complete", END],
  )
  .addEdge("lesson_complete", END)
  .compile();
