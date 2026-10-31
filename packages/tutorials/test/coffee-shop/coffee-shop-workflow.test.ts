import { expect, it } from "@jest/globals";
import { createWalkthroughWorkflow } from "../../src/coffee-shop/coffee-shop-workflow.js";
import { phasesForVersion } from "../../src/coffee-shop/coffee-shop-lessons.js";

function workflow(version = 6) {
  const calls: string[] = [];
  const state = {
    checkpoints: [1, 2, 3],
    checkOk: false,
    previewRevision: "reviewed",
    checkpointError: false,
  };
  const result = { ok: true, message: "Done." };
  const create = () =>
    createWalkthroughWorkflow(phasesForVersion(version), {
      workspace: async () => ({
        enabled: true,
        checkpoints: [...state.checkpoints],
      }),
      preview: async (id) => {
        calls.push("preview:" + id);
        return { ...result, revision: state.previewRevision };
      },
      prepare: async (id, revision) => {
        if (revision !== state.previewRevision)
          throw new Error("Review the updated diff.");
        calls.push("write:" + id);
        return result;
      },
      check: async (id) => {
        calls.push("check:" + id);
        return { ...result, ok: state.checkOk, revision: "saved" };
      },
      checkpoint: async (id) => {
        if (state.checkpointError) throw new Error("Storage unavailable.");
        calls.push("checkpoint:" + id);
        const phases = phasesForVersion(version);
        const phase = phases.find((candidate) => candidate.id === id)!;
        if (phases[phases.indexOf(phase) + 1]?.lesson !== phase.lesson)
          state.checkpoints.push(phase.lesson);
        return result;
      },
    });
  return { graph: create(), create, calls, state };
}

it("ends previews at approval and applies only the submitted reviewed revision", async () => {
  const { graph, calls, state } = workflow();
  expect(
    (await graph.invoke({ action: "preview", phaseId: "catalog" })).flow
      ?.status,
  ).toBe("await_approval");
  expect(calls).toEqual(["preview:catalog"]);
  await expect(
    graph.invoke({ action: "prepare", phaseId: "catalog" }),
  ).rejects.toThrow("Review the proposed diff");
  expect(calls).toEqual(["preview:catalog"]);
  state.previewRevision = "changed";
  await expect(
    graph.invoke({
      action: "prepare",
      phaseId: "catalog",
      revision: "reviewed",
    }),
  ).rejects.toThrow("updated diff");
  expect(calls).toEqual(["preview:catalog"]);
  expect(
    (
      await graph.invoke({
        action: "prepare",
        phaseId: "catalog",
        revision: "changed",
      })
    ).flow?.status,
  ).toBe("await_edit");
  expect(calls).toEqual(["preview:catalog", "write:catalog"]);
});

it("waits for edits after a failed check and for evidence after a passing check", async () => {
  const { graph, state, calls } = workflow();
  expect(
    (await graph.invoke({ action: "check", phaseId: "catalog" })).flow?.status,
  ).toBe("await_edit");
  state.checkOk = true;
  for (let poll = 0; poll < 3; poll++)
    expect(
      (await graph.invoke({ action: "check", phaseId: "catalog" })).flow
        ?.status,
    ).toBe("await_experiment");
  expect(calls).toEqual(Array(4).fill("check:catalog"));
  expect(state.checkpoints).toEqual([1, 2, 3]);
});

it("validates the connected handlers during the REPL exercise without seeding state", async () => {
  const { graph, calls } = workflow();
  const result = await graph.invoke({
    action: "check",
    phaseId: "context-repl",
  });
  expect(result.flow?.phaseId).toBe("context-repl");
  expect(calls).toEqual(["check:connect"]);
});

it.each([4, 5, 6])(
  "continues within a lesson but pauses at lesson boundaries for protocol %i",
  async (version) => {
    const { graph } = workflow(version);
    const phases = phasesForVersion(version);
    const internal = phases.findIndex(
      (phase, index) => phase.lesson === phases[index + 1]?.lesson,
    );
    const boundary = phases.findIndex(
      (phase, index) =>
        phases[index + 1] && phase.lesson !== phases[index + 1]?.lesson,
    );
    expect(
      (
        await graph.invoke({
          action: "checkpoint",
          phaseId: phases[internal]!.id,
        })
      ).flow,
    ).toEqual({
      phaseId: phases[internal]!.id,
      nextPhaseId: phases[internal + 1]!.id,
      status: "advance",
    });
    expect(
      (
        await graph.invoke({
          action: "checkpoint",
          phaseId: phases[boundary]!.id,
        })
      ).flow,
    ).toEqual({
      phaseId: phases[boundary]!.id,
      nextPhaseId: phases[boundary + 1]!.id,
      status: "await_next_lesson",
    });
  },
);

it("does not advance before completion, and resumes from the journal after recreation", async () => {
  const { graph, create, state } = workflow();
  state.checkpoints = [];
  await expect(
    graph.invoke({ action: "advance", phaseId: "orientation" }),
  ).rejects.toThrow("Complete this lesson");
  await graph.invoke({ action: "checkpoint", phaseId: "orientation" });
  expect(
    (await create().invoke({ action: "advance", phaseId: "orientation" })).flow,
  ).toEqual({
    phaseId: "orientation",
    nextPhaseId: "explore",
    status: "advance",
  });
});

it("does not report completion after a checkpoint failure, and allows a retry", async () => {
  const { graph, calls, state } = workflow();
  state.checkpointError = true;
  await expect(
    graph.invoke({ action: "checkpoint", phaseId: "catalog" }),
  ).rejects.toThrow("Storage unavailable");
  expect(calls).toEqual([]);
  state.checkpointError = false;
  expect(
    (await graph.invoke({ action: "checkpoint", phaseId: "catalog" })).flow
      ?.status,
  ).toBe("await_next_lesson");
});

it("keeps concurrent checks and previews separate", async () => {
  const { graph } = workflow();
  const [preview, check] = await Promise.all([
    graph.invoke({ action: "preview", phaseId: "catalog" }),
    graph.invoke({ action: "check", phaseId: "connect" }),
  ]);
  expect(preview.flow).toMatchObject({
    phaseId: "catalog",
    status: "await_approval",
  });
  expect(check.flow).toMatchObject({
    phaseId: "connect",
    status: "await_edit",
  });
  expect(check.revision).toBe("saved");
});

it("reports the final phase as finished without an invented next lesson", async () => {
  const { graph } = workflow();
  const last = phasesForVersion(6).at(-1)!;
  expect(
    (await graph.invoke({ action: "checkpoint", phaseId: last.id })).flow,
  ).toEqual({
    phaseId: last.id,
    nextPhaseId: undefined,
    status: "finished",
  });
});

it("rejects unknown phases before any operation", async () => {
  const { graph, calls } = workflow();
  await expect(
    graph.invoke({ action: "prepare", phaseId: "missing" }),
  ).rejects.toThrow("Unknown phase");
  expect(calls).toEqual([]);
});
