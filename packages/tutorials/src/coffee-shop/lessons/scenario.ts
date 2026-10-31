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
  id: "scenario",
  verification:
    "Your saved restock scenario changes Dark Roast without replacing the rest of the shop’s state. Run `restockDarkRoast` through the REPL’s `.scenario` command.",
  preparation:
    "Append an empty `restockDarkRoast` scenario, keeping `reset` and `startup`. It includes a guard for missing baseline inventory; you supply the assignment that changes Dark Roast.",
  lesson: 14,
  title: "Save a reusable setup",
  explanation:
    "A named scenario makes a REPL state change repeatable. This scenario changes only Dark Roast inventory. The other coffees and the order counter keep their current values.",
  instruction:
    "The existing guard stays in place. In scenarios/index.ts, implement `restockDarkRoast` to set Dark Roast’s shared inventory to 5 without changing the other products, then save the file.",
  edits: [
    {
      file: "scenarios/index.ts",
      instruction:
        "Change only Dark Roast’s quantity in the existing scenario.",
    },
  ],
  check: true,
  hint: "In scenarios/index.ts, find the TODO inside `restockDarkRoast`. Assign 5 to the `dark-roast` entry in the scenario’s shared context inventory. Keep the existing guard, other inventory entries, reset, startup, and the order counter unchanged, then save.",
  verificationHint:
    "At the terminal’s ⬣> prompt, use the `.scenario` command with the name `restockDarkRoast` and press Enter. Milo will detect its inventory change automatically.",
};

export const graph = new StateGraph(LessonState)
  .addNode("milo_explains", explain(lesson))
  .addNode("milo_proposes_scenario_support", propose(lesson))
  .addNode("wait_for_approval", () => ({}))
  .addNode("milo_prepares_scenario_support", apply(lesson))
  .addNode("learner_implements_focused_restock", instruct(lesson))
  .addNode("verify_saved_scenario", checkSaved(lesson))
  .addNode("milo_invites_experiment", (state) => {
    const { input } = state;
    if (input.entryState?.inventory?.["dark-roast"] !== 5)
      return verified(lesson)(state);
    const hint =
      input.state.inventory?.["dark-roast"] === 5
        ? "In the terminal’s REPL, assign 4 to the `dark-roast` entry in `context.inventory` and press Enter. Milo will detect the lower quantity automatically."
        : lesson.verificationHint;
    const prompt = { text: lesson.verification!, hint, action: "experiment" };
    if (
      input.state.inventory?.["dark-roast"] !== 5 ||
      input.event !== "poll" ||
      !input.announceSave
    )
      return { prompt };
    return {
      prompt,
      effect: {
        replies: [
          {
            text: "Dark Roast already has 5 bags. To make your scenario’s change observable, set Dark Roast inventory to 4 in the REPL.",
            hint,
            waitForAction: true,
            verification: true,
          },
        ],
      },
    };
  })
  .addNode("observe_focused_restock", ({ input }) => {
    if (input.event !== "poll") return { satisfied: false };
    const before = input.entryState?.inventory,
      after = input.state.inventory;
    if (before?.["dark-roast"] === 5 && after && after["dark-roast"] !== 5)
      return {
        satisfied: false,
        effect: {
          entryState: input.state,
          replies: [
            {
              text: "Dark Roast’s quantity has changed. Run `restockDarkRoast` through the REPL’s `.scenario` command.",
              waitForAction: true,
              hint: lesson.verificationHint,
            },
          ],
        },
      };
    const satisfied =
      !!before &&
      !!after &&
      before["dark-roast"] !== 5 &&
      after["dark-roast"] === 5 &&
      Object.entries(before).every(
        ([id, quantity]) => id === "dark-roast" || after[id] === quantity,
      );
    return {
      satisfied,
      effect:
        !satisfied && input.stateChanged && !input.announceSave
          ? {
              replies: [
                {
                  text: "Other inventory should stay unchanged. With Dark Roast below 5, run `restockDarkRoast` through the REPL’s `.scenario` command.",
                  waitForAction: true,
                },
              ],
            }
          : {},
    };
  })
  .addNode("lesson_complete", complete)
  .addEdge(START, "milo_explains")
  .addEdge("milo_explains", "milo_proposes_scenario_support")
  .addEdge("milo_proposes_scenario_support", "wait_for_approval")
  .addConditionalEdges(
    "wait_for_approval",
    ({ input }) =>
      input.prepared || input.event === "prepare" || input.event === "check"
        ? "milo_prepares_scenario_support"
        : END,
    ["milo_prepares_scenario_support", END],
  )
  .addConditionalEdges(
    "milo_prepares_scenario_support",
    ({ input }) =>
      input.event !== "prepare" || input.prepared
        ? "learner_implements_focused_restock"
        : END,
    ["learner_implements_focused_restock", END],
  )
  .addEdge("learner_implements_focused_restock", "verify_saved_scenario")
  .addConditionalEdges(
    "verify_saved_scenario",
    ({ input }) => (input.ready ? "milo_invites_experiment" : END),
    ["milo_invites_experiment", END],
  )
  .addEdge("milo_invites_experiment", "observe_focused_restock")
  .addConditionalEdges(
    "observe_focused_restock",
    ({ satisfied }) => (satisfied ? "lesson_complete" : END),
    ["lesson_complete", END],
  )
  .addEdge("lesson_complete", END)
  .compile();
