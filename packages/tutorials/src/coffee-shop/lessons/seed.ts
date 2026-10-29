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
import { hasBaseline, baselineRecovery } from "./reset-evidence.js";

export const lesson: LessonPhase = {
  id: "seed",
  verification:
    "Your saved scenarios now provide a starting catalog and inventory, with startup reusing reset. In the REPL, use the `.scenario` command to run `reset`.",
  preparation:
    "Add `Context.reset()` and the `reset` scenario containing the catalog and initial quantities. `reset` clears state and IDs before the scenario installs its baseline. Nothing applies the scenario to the running API yet.",
  lesson: 9,
  title: "Initialize context with scenarios",
  explanation:
    "You’ve changed the running context directly in the REPL. A scenario saves a setup as a function so you can repeat it. The reset scenario installs a complete baseline; startup tells Counterfact to apply that baseline when the server starts. Saving its file alone does not apply it to this session.",
  instruction:
    "The baseline in scenarios/index.ts contains three coffees so stock changes are easy to see. Export the existing `reset` scenario under the name `startup` as well, so both names run the same function, then save the file.",
  edits: [
    {
      file: "scenarios/index.ts",
      instruction: "Append startup so subsequent server starts apply reset.",
    },
  ],
  check: true,
  hint: "In scenarios/index.ts, the reset scenario already installs the baseline. Export that same function under the additional name `startup`; use an export alias rather than copying its body. Keep the existing reset export and save.",
  verificationHint:
    "At the terminal’s ⬣> prompt, use the `.scenario` command with the existing scenario name `reset` and press Enter. Milo will observe the running inventory automatically.",
};

export const graph = new StateGraph(LessonState)
  .addNode("milo_explains", explain(lesson))
  .addNode("milo_proposes_seed_support", propose(lesson))
  .addNode("wait_for_approval", () => ({}))
  .addNode("milo_prepares_seed_support", apply(lesson))
  .addNode("learner_exports_startup", instruct(lesson))
  .addNode("verify_saved_seed", checkSaved(lesson))
  .addNode("milo_invites_experiment", (state) => {
    const { input } = state;
    const wasBaseline = hasBaseline(input.entryState, input.baseline);
    const isBaseline = hasBaseline(input.state, input.baseline);
    const hint = !isBaseline
      ? baselineRecovery(input.state, input.baseline)
      : wasBaseline
        ? "In the terminal’s REPL, assign 0 to the `dark-roast` entry in `context.inventory` and press Enter. Milo will detect that the baseline has changed."
        : undefined;
    const prompt = { text: lesson.verification!, hint, action: "experiment" };
    if (!wasBaseline) return { ...verified(lesson)(state), prompt };
    if (!isBaseline || input.event !== "poll" || !input.announceSave)
      return { prompt };
    return {
      prompt,
      effect: {
        replies: [
          {
            text: "Startup has already applied the baseline in this session. To observe reset changing state, set Dark Roast to 0 in the REPL.",
            hint,
            waitForAction: true,
            verification: true,
          },
        ],
      },
    };
  })
  .addNode("observe_complete_reset", ({ input }) => {
    if (input.event !== "poll") return { satisfied: false };
    if (
      hasBaseline(input.entryState, input.baseline) &&
      !hasBaseline(input.state, input.baseline)
    )
      return {
        satisfied: false,
        effect: {
          entryState: input.state,
          replies: [
            {
              text: "The running shop has changed. Run the reset scenario in the REPL.",
              waitForAction: true,
              hint: lesson.verificationHint,
            },
          ],
        },
      };
    const satisfied =
      hasBaseline(input.state, input.baseline) &&
      !hasBaseline(input.entryState, input.baseline);
    return {
      satisfied,
      effect:
        !satisfied && input.stateChanged && !input.announceSave
          ? {
              replies: [
                {
                  text: baselineRecovery(input.state, input.baseline),
                  waitForAction: true,
                  unique: true,
                },
              ],
            }
          : {},
    };
  })
  .addNode("lesson_complete", complete)
  .addEdge(START, "milo_explains")
  .addEdge("milo_explains", "milo_proposes_seed_support")
  .addEdge("milo_proposes_seed_support", "wait_for_approval")
  .addConditionalEdges(
    "wait_for_approval",
    ({ input }) =>
      input.prepared || input.event === "prepare" || input.event === "check"
        ? "milo_prepares_seed_support"
        : END,
    ["milo_prepares_seed_support", END],
  )
  .addConditionalEdges(
    "milo_prepares_seed_support",
    ({ input }) =>
      input.event !== "prepare" || input.prepared
        ? "learner_exports_startup"
        : END,
    ["learner_exports_startup", END],
  )
  .addEdge("learner_exports_startup", "verify_saved_seed")
  .addConditionalEdges(
    "verify_saved_seed",
    ({ input }) => (input.ready ? "milo_invites_experiment" : END),
    ["milo_invites_experiment", END],
  )
  .addEdge("milo_invites_experiment", "observe_complete_reset")
  .addConditionalEdges(
    "observe_complete_reset",
    ({ satisfied }) => (satisfied ? "lesson_complete" : END),
    ["lesson_complete", END],
  )
  .addEdge("lesson_complete", END)
  .compile();
