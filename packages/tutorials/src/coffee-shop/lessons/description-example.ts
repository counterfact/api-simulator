import { StateGraph, START, END } from "@langchain/langgraph";
import type { LessonPhase } from "../coffee-shop-lessons.js";
import {
  LessonState,
  checkSaved,
  explain,
  instruct,
  verified,
  complete,
} from "./runtime.js";

export const lesson: LessonPhase = {
  id: "description-example",
  verification:
    "You’ve given the description field meaningful coffee examples while keeping the handler random. Counterfact reloads the spec without restarting. Click Refresh products and compare the generated descriptions with your examples.",
  lesson: 3,
  title: "Give generated descriptions coffee examples",
  explanation:
    "The name field already has ten coffee examples in the OpenAPI schema. Examples can also give the description field meaningful values while the handler keeps calling `.random()`.",
  instruction:
    "The description field’s string type and length limit stay in place. In openapi.yaml, add a few sensible coffee descriptions to `components.schemas.Product.properties.description.examples`, then save.",
  edits: [
    {
      file: "openapi.yaml",
      instruction:
        "Add examples inside the existing Product description property.",
    },
  ],
  check: true,
  hint: "In openapi.yaml, find description inside components → schemas → Product → properties. Add `examples` at the same indentation as `type` and `maxLength`. Under it, indent a YAML list with at least two different coffee descriptions, each on its own line starting with a dash. Keep each description within 120 characters, preserve the existing type and limit, then save.",
  verificationHint:
    "Click Refresh products at the top right. Expand the GET request’s HTTP details in your chat bubble. Every description should come from the examples you saved.",
};

export const graph = new StateGraph(LessonState)
  .addNode("milo_explains", explain(lesson))
  .addNode("learner_adds_description_examples", instruct(lesson))
  .addNode("verify_saved_description_example", checkSaved(lesson))
  .addNode("milo_invites_experiment", verified(lesson))
  .addNode("observe_description_examples", ({ input }) => {
    if (input.event !== "products" || input.source !== "manual")
      return { satisfied: false };
    const matches =
      !!input.expectedExamples?.length &&
      input.products.length > 0 &&
      input.products.every((product) =>
        input.expectedExamples!.includes(product.description),
      );
    return {
      satisfied: matches,
      effect: matches
        ? {
            completionMessage:
              "The generated response now uses your OpenAPI description examples. The product handler still calls `.random()`.",
          }
        : {
            replies: [
              {
                text: "The example is saved. Wait for Counterfact to reload the spec, then refresh products again to observe it.",
                waitForAction: true,
                hint: "Click Refresh products again after Counterfact has reloaded the saved OpenAPI file. The response values must match your saved examples.",
              },
            ],
          },
    };
  })
  .addNode("lesson_complete", complete)
  .addEdge(START, "milo_explains")
  .addEdge("milo_explains", "learner_adds_description_examples")
  .addEdge(
    "learner_adds_description_examples",
    "verify_saved_description_example",
  )
  .addConditionalEdges(
    "verify_saved_description_example",
    ({ input }) => (input.ready ? "milo_invites_experiment" : END),
    ["milo_invites_experiment", END],
  )
  .addEdge("milo_invites_experiment", "observe_description_examples")
  .addConditionalEdges(
    "observe_description_examples",
    ({ satisfied }) => (satisfied ? "lesson_complete" : END),
    ["lesson_complete", END],
  )
  .addEdge("lesson_complete", END)
  .compile();
