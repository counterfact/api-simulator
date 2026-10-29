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
  id: "catalog",
  verification:
    "Great job! You replaced the default random response with a meaningful catalog. The same three coffees should now appear on each request. Click Refresh products and inspect the response in your chat bubble.",
  preparation:
    "Remember how `routes/products.ts` returns random data with `.random()`? Instead of rolling dice, let's return predictable, hard-coded JSON data. To get us started, I'll create a constant called `catalog` with dummy data.",
  approval:
    "Whenever I want to make a change to a file, I'll show you what I'm going to do first. Then you can approve by clicking \"Apply changes.\"",
  lesson: 4,
  title: "Replace random products",
  explanation:
    "A handler is your function for an HTTP operation. Returning explicit JSON gives you control over the response instead of generating it from the schema.",
  instruction:
    "I’ve added the catalog above the handler. In routes/products.ts, replace `.random()` with `.json(catalog)` and save.",
  edits: [
    {
      file: "routes/products.ts",
      instruction: "Keep the existing status, imports, and supplied catalog.",
    },
  ],
  check: true,
  hint: "In routes/products.ts, find the return statement inside GET. Keep `$.response.status(200)` and the supplied catalog constant. Replace only `.random()` with `.json(catalog)`, then save.",
  verificationHint:
    "Click Refresh products at the top right. Expand the GET request’s HTTP details in your chat bubble to see the three coffees returned by your catalog.",
};

export const graph = new StateGraph(LessonState)
  .addNode("milo_explains", explain(lesson))
  .addNode("milo_proposes_catalog", propose(lesson))
  .addNode("wait_for_approval", () => ({}))
  .addNode("milo_adds_catalog", apply(lesson))
  .addNode("learner_replaces_random_response", instruct(lesson))
  .addNode("verify_catalog_handler", checkSaved(lesson))
  .addNode("milo_invites_experiment", verified(lesson))
  .addNode("compare_catalog_responses", ({ input }) => {
    if (input.event !== "products" || input.source !== "manual")
      return { satisfied: false };
    const current = JSON.stringify(input.products);
    const reads = current === input.lastCatalog ? input.catalogReads + 1 : 1;
    return {
      satisfied: reads >= 2,
      effect: { catalogReads: reads, lastCatalog: current },
    };
  })
  .addNode("milo_requests_second_refresh", () => ({
    effect: {
      replies: [
        {
          text: "The catalog is in place. Click Refresh products once more and compare the two responses in the chat.",
          hint: "Click Refresh products at the top right once more. Compare this GET response with the previous one in the chat; the three catalog entries should match.",
          waitForAction: true,
        },
      ],
    },
  }))
  .addNode("lesson_complete", complete)
  .addEdge(START, "milo_explains")
  .addEdge("milo_explains", "milo_proposes_catalog")
  .addEdge("milo_proposes_catalog", "wait_for_approval")
  .addConditionalEdges(
    "wait_for_approval",
    ({ input }) =>
      input.prepared || input.event === "prepare" || input.event === "check"
        ? "milo_adds_catalog"
        : END,
    ["milo_adds_catalog", END],
  )
  .addConditionalEdges(
    "milo_adds_catalog",
    ({ input }) =>
      input.event !== "prepare" || input.prepared
        ? "learner_replaces_random_response"
        : END,
    ["learner_replaces_random_response", END],
  )
  .addEdge("learner_replaces_random_response", "verify_catalog_handler")
  .addConditionalEdges(
    "verify_catalog_handler",
    ({ input }) => (input.ready ? "milo_invites_experiment" : END),
    ["milo_invites_experiment", END],
  )
  .addEdge("milo_invites_experiment", "compare_catalog_responses")
  .addConditionalEdges(
    "compare_catalog_responses",
    ({ input, satisfied }) =>
      satisfied
        ? "lesson_complete"
        : input.event === "products" && input.source === "manual"
          ? "milo_requests_second_refresh"
          : END,
    ["lesson_complete", "milo_requests_second_refresh", END],
  )
  .addEdge("milo_requests_second_refresh", END)
  .addEdge("lesson_complete", END)
  .compile();
