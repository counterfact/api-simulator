import * as orientation from "./lessons/orientation.js";
import * as explore from "./lessons/explore.js";
import * as description_example from "./lessons/description-example.js";
import * as catalog from "./lessons/catalog.js";
import * as order from "./lessons/order.js";
import * as fail from "./lessons/fail.js";
import * as retry from "./lessons/retry.js";
import * as context from "./lessons/context.js";
import * as connect from "./lessons/connect.js";
import * as context_repl from "./lessons/context-repl.js";
import * as seed from "./lessons/seed.js";
import * as decaf from "./lessons/decaf.js";
import * as rules from "./lessons/rules.js";
import * as observe from "./lessons/observe.js";
import * as reduce from "./lessons/reduce.js";
import * as sellout from "./lessons/sellout.js";
import * as restock from "./lessons/restock.js";
import * as scenario from "./lessons/scenario.js";
import { emptyInput } from "./lessons/runtime.js";
import type {
  LessonInput,
  LessonEffect,
  LessonOperations,
} from "./lessons/runtime.js";
import type { WorkflowResult } from "./coffee-shop-workflow.js";

// Reading order matches the learner journey. Each entry is an executable graph.
type CurriculumPhase = {
  lesson: import("./coffee-shop-lessons.js").LessonPhase;
  graph: {
    invoke(
      input: { input: LessonInput },
      config?: { configurable: { operations: LessonOperations } },
    ): Promise<{
      effect: LessonEffect;
      prompt?: { text: string; hint?: string; action?: string };
      operation?: WorkflowResult;
    }>;
    getGraphAsync(): Promise<{ drawMermaid(): string }>;
  };
};
export const curriculum: CurriculumPhase[] = [
  orientation,
  explore,
  description_example,
  catalog,
  order,
  fail,
  retry,
  context,
  connect,
  context_repl,
  seed,
  decaf,
  rules,
  observe,
  reduce,
  sellout,
  restock,
  scenario,
];
export const currentPhases = curriculum.map((phase) => phase.lesson);

export async function runLessonOperation(
  phaseId: string,
  action: "preview" | "prepare" | "check",
  operations: LessonOperations,
  revision?: string,
): Promise<WorkflowResult> {
  const phase = curriculum.find((phase) => phase.lesson.id === phaseId);
  if (!phase) throw new Error("Unknown lesson phase.");
  if (action !== "check" && !phase.lesson.preparation)
    throw new Error("This phase needs no preparation.");
  if (action === "check" && !phase.lesson.check && phaseId !== "context-repl")
    return operations.check(phaseId);
  const result = await phase.graph.invoke(
    { input: { ...emptyInput(), event: action, prepared: true, revision } },
    { configurable: { operations } },
  );
  if (!result.operation)
    throw new Error(
      "The lesson did not perform the requested workspace action.",
    );
  return result.operation;
}

export async function observeLesson(
  phaseId: string,
  input: LessonInput,
): Promise<LessonEffect> {
  const phase = curriculum.find((phase) => phase.lesson.id === phaseId);
  if (!phase) throw new Error("Unknown lesson phase.");
  const result = await phase.graph.invoke({ input });
  return { ...result.effect, hint: result.prompt?.hint };
}
