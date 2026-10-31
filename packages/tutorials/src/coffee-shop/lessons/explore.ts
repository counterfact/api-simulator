import { StateGraph, START, END } from "@langchain/langgraph";
import type { LessonPhase } from "../coffee-shop-lessons.js";
import { LessonState, explain, instruct, complete } from "./runtime.js";

export const lesson: LessonPhase = {
  id: "explore",
  background: [
    "Before we inspect the handler, here’s where this API starts. OpenAPI, formerly Swagger, is a format for describing an HTTP API: its endpoints, the requests they accept, and the responses they return. A schema describes the shape of data, including its properties, types, and limits. Counterfact includes a coffee-shop API description with this walkthrough and saved a copy as openapi.yaml in your demo folder. It used that file to generate your starting handlers and TypeScript types.",
    'New handlers import `Routes` from `types/index.ts`. The local `Route` alias selects this endpoint, and `Route["GET"]` describes its GET handler. These types let your editor check requests and responses. Existing handler annotations can stay in place; the exercise changes the response body.',
  ],
  lesson: 2,
  title: "Explore your generated API",
  explanation:
    "The shop makes HTTP requests to your local API, which is running at ",
  instruction:
    "The generated starting handler in routes/products.ts calls `$.response.status(200).random()`: Counterfact uses the OpenAPI schema to generate a response on each request. The starting order stub also generates data rather than reading your cart or changing inventory. Click Refresh products and compare the products and the actual response in your chat bubble.",
  edits: [
    {
      file: "routes/products.ts",
      instruction: "Inspect the generated stub. Do not change it yet.",
    },
  ],
  hint: "Click Refresh products at the top right of the shop. In your new chat bubble, expand the GET request’s HTTP details and compare its response body with the coffee cards.",
};

export const graph = new StateGraph(LessonState)
  .addNode("milo_explains", explain(lesson))
  .addNode("learner_inspects_and_refreshes", instruct(lesson))
  .addNode("observe_generated_products", ({ input }) => {
    return {
      satisfied: input.event === "products" && input.source === "manual",
      effect: {
        started: true,
        completionMessage:
          "The returned products follow the shapes described in openapi.yaml. At this point Counterfact doesn't know anything about the description field except that it's a string, so it's generating random, nonsensical strings. Let's fix that.",
      },
    };
  })
  .addNode("lesson_complete", complete)
  .addEdge(START, "milo_explains")
  .addEdge("milo_explains", "learner_inspects_and_refreshes")
  .addEdge("learner_inspects_and_refreshes", "observe_generated_products")
  .addConditionalEdges(
    "observe_generated_products",
    ({ satisfied }) => (satisfied ? "lesson_complete" : END),
    ["lesson_complete", END],
  )
  .addEdge("lesson_complete", END)
  .compile();
