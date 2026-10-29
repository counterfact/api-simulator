import { StateGraph, START, END } from "@langchain/langgraph";
import type { LessonPhase } from "../coffee-shop-lessons.js";
import {
  LessonState,
  explain,
  instruct,
  complete,
  purchaseObservation,
} from "./runtime.js";

export const lesson: LessonPhase = {
  id: "observe",
  question: {
    prompt: "Does accepting an order also subtract stock?",
    answers: [
      { label: "Yes, stock decreased", value: true },
      { label: "No, stock stayed the same", value: false },
    ],
    retryExplanation: {
      reduced:
        "Stock decreased because your current handler already subtracts the purchased quantities.",
      unchanged:
        "The order succeeded, but stock stayed the same. Returning a confirmation and changing context are separate operations. Your handler must explicitly subtract the purchased quantities.",
    },
    hints: {
      answer:
        "Compare the before and after stock counts shown with the question. Choose No if stock stayed the same, or Yes if it fell by the purchased quantity.",
      retry:
        "Click Try again below the inventory question. Compare the stock before and after the order: unchanged stock means the order did not subtract it; a decrease by the purchased quantity means it did.",
    },
  },
  lesson: 12,
  title: "Make purchases reduce inventory",
  explanation:
    "Your current handler accepts orders and checks stock. A purchase and its next product response reveal whether anything updates the inventory.",
  instruction:
    "Note Dark Roast’s stock, click its Add to cart button once, then click Place order.",
  edits: [],
  hint: "Note Dark Roast’s displayed stock. Add one bag of Dark Roast to the cart, then click Place order.",
};

export const graph = new StateGraph(LessonState)
  .addNode("milo_explains", explain(lesson))
  .addNode("learner_buys_and_compares_stock", instruct(lesson))
  .addNode("compare_purchase_and_answer", ({ input }) => {
    const observed = purchaseObservation(input);
    if (
      observed &&
      (observed.after === observed.before ||
        observed.after === observed.before - observed.quantity)
    )
      return {
        satisfied: false,
        effect: {
          observation: observed,
          quizWrong: false,
          replies: [
            {
              text: `Dark Roast API stock: ${observed.before} → ${observed.after} after buying ${observed.quantity}.`,
            },
          ],
        },
      };
    if (input.event !== "answer" || !input.observation)
      return { satisfied: false };
    const reduced =
      input.observation.after ===
      input.observation.before - input.observation.quantity;
    return {
      satisfied: input.answer === reduced,
      effect:
        input.answer !== reduced
          ? {
              quizWrong: true,
              replies: [
                {
                  text: reduced
                    ? "Stock decreased because your handler already subtracts the purchased quantities."
                    : "The order succeeded, but stock stayed the same. A confirmation does not change context. The handler must explicitly subtract the purchased quantities.",
                },
              ],
            }
          : {},
    };
  })
  .addNode("lesson_complete", complete)
  .addEdge(START, "milo_explains")
  .addEdge("milo_explains", "learner_buys_and_compares_stock")
  .addEdge("learner_buys_and_compares_stock", "compare_purchase_and_answer")
  .addConditionalEdges(
    "compare_purchase_and_answer",
    ({ satisfied }) => (satisfied ? "lesson_complete" : END),
    ["lesson_complete", END],
  )
  .addEdge("lesson_complete", END)
  .compile();
