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
  stock,
} from "./runtime.js";

export const lesson: LessonPhase = {
  id: "rules",
  verification:
    "Your saved handler now rejects orders it cannot fulfill with HTTP 409 while preserving inventory. Click Add to cart on Dark Roast twice, lower its inventory to 1 in the terminal’s REPL, then click Refresh products and Place order.",
  preparation:
    "Add `quantitiesFor()`, `getShortages()`, and `canFulfill()` to `Context`. `quantitiesFor` combines repeated IDs, `getShortages` compares requested and available quantities, and `canFulfill` rejects invalid quantities. Your handler will not use them until you add its branch.",
  lesson: 11,
  title: "Add stock rules",
  explanation:
    "Counterfact supplies the context object, but stock rules are your methods. `canFulfill` checks quantities; `getShortages` reports requested and available stock, combining repeated product IDs. The route maps that result to HTTP 409.",
  instruction:
    "The new `Context` methods supply stock validation and shortage details. In routes/orders.ts, check the incoming items with the shared context’s `canFulfill` method before confirming the order. For a failed check, return HTTP 409 with an `error` message and a `shortages` property from `getShortages`; otherwise keep the successful confirmation. Save the file.",
  edits: [
    {
      file: "routes/orders.ts",
      instruction:
        "Reject invalid or oversized orders before creating a confirmation.",
    },
  ],
  check: true,
  hint: "In routes/orders.ts, add a check before the successful confirmation. Pass the incoming items to `$.context.canFulfill`. When it returns false, return status 409 with an error string and a shortages array returned by `$.context.getShortages` for the same items. Keep successful requests using the existing confirmation, then save.",
  verificationHint:
    "Add two bags of Dark Roast to the cart while stock allows it. In the terminal’s REPL, set the `dark-roast` entry in `context.inventory` to 1. Return to the shop, click Refresh products, then Place order.",
};

export const graph = new StateGraph(LessonState)
  .addNode("milo_explains", explain(lesson))
  .addNode("milo_proposes_rules_support", propose(lesson))
  .addNode("wait_for_approval", () => ({}))
  .addNode("milo_prepares_rules_support", apply(lesson))
  .addNode("learner_adds_stock_rejection", instruct(lesson))
  .addNode("verify_saved_rules", checkSaved(lesson))
  .addNode("milo_invites_experiment", verified(lesson))
  .addNode("observe_rejection_and_cleanup", ({ input }) => {
    if (
      input.event === "order" &&
      input.status === 409 &&
      input.response?.shortages?.some(
        (shortage) => shortage.requested > shortage.available,
      )
    )
      return {
        satisfied: false,
        effect: {
          rejectionSeen: true,
          replies: [
            {
              text: "The oversized order was rejected. Click Empty cart, restore Dark Roast inventory to 3 in the terminal’s REPL, then click Refresh products.",
              hint: "Click Empty cart in the shop. In the REPL, assign 3 to the `dark-roast` entry in `context.inventory`. Return to the shop and click Refresh products.",
              waitForAction: true,
            },
          ],
        },
      };
    return {
      satisfied:
        input.event === "products" &&
        input.rejectionSeen &&
        input.cartSize === 0 &&
        stock(input)["dark-roast"] === 3,
    };
  })
  .addNode("lesson_complete", complete)
  .addEdge(START, "milo_explains")
  .addEdge("milo_explains", "milo_proposes_rules_support")
  .addEdge("milo_proposes_rules_support", "wait_for_approval")
  .addConditionalEdges(
    "wait_for_approval",
    ({ input }) =>
      input.prepared || input.event === "prepare" || input.event === "check"
        ? "milo_prepares_rules_support"
        : END,
    ["milo_prepares_rules_support", END],
  )
  .addConditionalEdges(
    "milo_prepares_rules_support",
    ({ input }) =>
      input.event !== "prepare" || input.prepared
        ? "learner_adds_stock_rejection"
        : END,
    ["learner_adds_stock_rejection", END],
  )
  .addEdge("learner_adds_stock_rejection", "verify_saved_rules")
  .addConditionalEdges(
    "verify_saved_rules",
    ({ input }) => (input.ready ? "milo_invites_experiment" : END),
    ["milo_invites_experiment", END],
  )
  .addEdge("milo_invites_experiment", "observe_rejection_and_cleanup")
  .addConditionalEdges(
    "observe_rejection_and_cleanup",
    ({ satisfied }) => (satisfied ? "lesson_complete" : END),
    ["lesson_complete", END],
  )
  .addEdge("lesson_complete", END)
  .compile();
