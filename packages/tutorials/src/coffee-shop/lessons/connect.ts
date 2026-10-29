import { StateGraph, START, END } from "@langchain/langgraph";
import type { LessonPhase } from "../coffee-shop-lessons.js";
import {
  LessonState,
  explain,
  instruct,
  complete,
  checkSaved,
} from "./runtime.js";

export const lesson: LessonPhase = {
  id: "connect",
  verification:
    "Your handlers now use the shared context. Next, change that same object from the REPL and observe it through the shop.",
  lesson: 8,
  title: "Connect routes and the REPL",
  explanation:
    "Connecting the handlers to this shared object lets HTTP requests read the state you change in the REPL. The fields start empty in a fresh context; any data you’ve already added to this running session is kept.",
  instruction:
    "The `ordersAvailable` switch and failure branch stay in place. In routes/products.ts, pass the result of the shared context’s `listProducts` method to the JSON response. In routes/orders.ts, pass the incoming items to the shared context’s `confirmOrder` method and return its result as JSON, then save both files.",
  edits: [
    {
      file: "routes/products.ts",
      instruction: "Read the catalog from shared context.",
    },
    {
      file: "routes/orders.ts",
      instruction: "Create confirmations through shared context.",
    },
  ],
  check: true,
  hint: "In routes/products.ts, replace the catalog argument to the JSON response with the result of `$.context.listProducts`. In routes/orders.ts, pass `$.body.items` to `$.context.confirmOrder` and use its returned object as the JSON response. Call both methods, keep the availability switch and statuses, then save both files.",
  verificationHint:
    "Click Refresh products at the top right so the shop reads your shared context.",
  introduction:
    "The class in routes/_.context.ts describes your shop’s shared state and methods. Counterfact creates one running instance. Inside a route, `$.context` refers to that instance. In the terminal, `context` refers to the same instance. The ⬣> prompt is a REPL—a read–eval–print loop where you enter JavaScript and see its result while Counterfact keeps running.",
};

export const graph = new StateGraph(LessonState)
  .addNode("milo_explains", explain(lesson))
  .addNode("learner_connects_routes_to_context", instruct(lesson))
  .addNode("verify_saved_connect", checkSaved(lesson))
  .addNode("verify_connected_routes", ({ input }) => {
    return {
      satisfied: input.event === "poll",
      effect: { completionMessage: lesson.verification },
    };
  })
  .addNode("lesson_complete", complete)
  .addEdge(START, "milo_explains")
  .addEdge("milo_explains", "learner_connects_routes_to_context")
  .addEdge("learner_connects_routes_to_context", "verify_saved_connect")
  .addConditionalEdges(
    "verify_saved_connect",
    ({ input }) => (input.ready ? "verify_connected_routes" : END),
    ["verify_connected_routes", END],
  )
  .addConditionalEdges(
    "verify_connected_routes",
    ({ satisfied }) => (satisfied ? "lesson_complete" : END),
    ["lesson_complete", END],
  )
  .addEdge("lesson_complete", END)
  .compile();
