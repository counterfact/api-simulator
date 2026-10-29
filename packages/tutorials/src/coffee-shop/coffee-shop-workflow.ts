import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { LessonPhase } from "./coffee-shop-lessons.js";
import type { FileChange, EditEvent } from "./coffee-shop-workspace.js";
import { currentPhases, runLessonOperation } from "./coffee-shop-curriculum.js";

export type WorkflowRequest = {
  action: "preview" | "prepare" | "check" | "checkpoint" | "advance";
  phaseId: string;
  revision?: string;
};

export type WorkflowResult = {
  ok: boolean;
  message: string;
  revision?: string;
  files?: FileChange[];
  changes?: EditEvent[];
  example?: unknown;
  examples?: unknown;
  flow?: {
    status:
      | "await_approval"
      | "await_edit"
      | "await_experiment"
      | "await_next_lesson"
      | "advance"
      | "finished";
    phaseId: string;
    nextPhaseId?: string;
  };
};

type Workspace = { enabled: boolean; checkpoints: number[] };
type Operations = {
  workspace: () => Promise<Workspace>;
  preview: (phaseId: string) => Promise<WorkflowResult>;
  prepare: (phaseId: string, revision?: string) => Promise<WorkflowResult>;
  check: (phaseId: string) => Promise<WorkflowResult>;
  checkpoint: (phaseId: string) => Promise<WorkflowResult>;
};

const WorkflowState = Annotation.Root({
  request: Annotation<WorkflowRequest>(),
  workspace: Annotation<Workspace>(),
  result: Annotation<WorkflowResult>(),
});

/**
 * One invocation handles one learner event. Wait nodes end the invocation;
 * background checks cannot approve a proposal or advance a lesson. The project
 * journal, read afresh on entry, remains the durable authority across restarts.
 */
export function createWalkthroughWorkflow(
  phases: LessonPhase[],
  operations: Operations,
): { invoke(request: WorkflowRequest): Promise<WorkflowResult> } {
  const phaseFor = (id: string) => {
    const phase = phases.find((candidate) => candidate.id === id);
    if (!phase) throw new Error("Unknown phase.");
    return phase;
  };
  const nextFor = (id: string) => phases[phases.indexOf(phaseFor(id)) + 1];
  const operate = (
    action: "preview" | "prepare" | "check",
    request: WorkflowRequest,
  ) =>
    phases === currentPhases
      ? runLessonOperation(
          request.phaseId,
          action,
          operations,
          request.revision,
        )
      : action === "preview"
        ? operations.preview(request.phaseId)
        : action === "prepare"
          ? operations.prepare(request.phaseId, request.revision)
          : operations.check(
              request.phaseId === "context-repl" ? "connect" : request.phaseId,
            );
  const wait =
    (status: NonNullable<WorkflowResult["flow"]>["status"]) =>
    (state: typeof WorkflowState.State) => ({
      result: {
        ...state.result,
        flow: {
          status,
          phaseId: state.request.phaseId,
          nextPhaseId: nextFor(state.request.phaseId)?.id,
        },
      },
    });
  const graph = new StateGraph(WorkflowState)
    .addNode("load", async ({ request }) => {
      phaseFor(request.phaseId);
      const { enabled, checkpoints } = await operations.workspace();
      return { workspace: { enabled, checkpoints } };
    })
    .addNode("preview", async ({ request }) => ({
      result: await operate("preview", request),
    }))
    .addNode("prepare", async ({ request }) => {
      if (!request.revision)
        throw new Error("Review the proposed diff before applying changes.");
      return {
        result: await operate("prepare", request),
      };
    })
    .addNode("check", async ({ request }) => ({
      result: await operate("check", request),
    }))
    .addNode("checkpoint", async ({ request }) => ({
      result: await operations.checkpoint(request.phaseId),
    }))
    .addNode("next_lesson", ({ request, workspace }) => {
      const phase = phaseFor(request.phaseId);
      if (workspace.enabled && !workspace.checkpoints.includes(phase.lesson))
        throw new Error("Complete this lesson before starting the next one.");
      return { result: { ok: true, message: "Continue to the next lesson." } };
    })
    .addNode("await_approval", wait("await_approval"))
    .addNode("await_edit", wait("await_edit"))
    .addNode("await_experiment", wait("await_experiment"))
    .addNode("await_next_lesson", wait("await_next_lesson"))
    .addNode("advance", wait("advance"))
    .addNode("finished", wait("finished"))
    .addEdge(START, "load")
    .addConditionalEdges(
      "load",
      ({ request }) => {
        switch (request.action) {
          case "preview":
            return "preview";
          case "prepare":
            return "prepare";
          case "check":
            return "check";
          case "checkpoint":
            return "checkpoint";
          case "advance":
            return "next_lesson";
          default:
            throw new Error("Unknown workspace action.");
        }
      },
      ["preview", "prepare", "check", "checkpoint", "next_lesson"],
    )
    .addConditionalEdges(
      "preview",
      ({ result }) => (result.ok ? "await_approval" : END),
      ["await_approval", END],
    )
    .addConditionalEdges(
      "prepare",
      ({ result }) => (result.ok ? "await_edit" : END),
      ["await_edit", END],
    )
    .addConditionalEdges(
      "check",
      ({ result }) => (result.ok ? "await_experiment" : "await_edit"),
      ["await_experiment", "await_edit"],
    )
    .addConditionalEdges(
      "checkpoint",
      ({ request, result }) => {
        if (!result.ok) return END;
        const next = nextFor(request.phaseId);
        if (!next) return "finished";
        return next.lesson === phaseFor(request.phaseId).lesson
          ? "advance"
          : "await_next_lesson";
      },
      [END, "finished", "advance", "await_next_lesson"],
    )
    .addConditionalEdges(
      "next_lesson",
      ({ request }) => (nextFor(request.phaseId) ? "advance" : "finished"),
      ["advance", "finished"],
    )
    .addEdge("await_approval", END)
    .addEdge("await_edit", END)
    .addEdge("await_experiment", END)
    .addEdge("await_next_lesson", END)
    .addEdge("advance", END)
    .addEdge("finished", END)
    .compile();
  return {
    async invoke(request) {
      const state = await graph.invoke({ request });
      return state.result;
    },
  };
}
