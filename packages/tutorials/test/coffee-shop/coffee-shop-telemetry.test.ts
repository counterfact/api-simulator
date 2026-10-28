import { randomUUID } from "node:crypto";
import { channel } from "node:diagnostics_channel";
import { afterEach, expect, it } from "@jest/globals";

import {
  PHASES,
  PHASES_V2,
} from "../../src/coffee-shop/coffee-shop-lessons.js";
import {
  reportCoffeeShopEvent,
  reportWalkthroughEvent,
} from "../../src/coffee-shop/coffee-shop-telemetry.js";

const events = channel("counterfact:walkthrough");
let received: unknown[] = [];
const collect = (event: unknown) => received.push(event);
afterEach(() => {
  events.unsubscribe(collect);
  received = [];
});

it("connects milestones within a session and deduplicates reloads and revisits", () => {
  events.subscribe(collect);
  const session = randomUUID();
  reportCoffeeShopEvent(session, "opened", 0);
  reportCoffeeShopEvent(session, "opened", 0);
  reportCoffeeShopEvent(session, "started", 0);
  reportCoffeeShopEvent(session, "phase_completed", 1);
  reportCoffeeShopEvent(session, "phase_completed", 1);
  reportCoffeeShopEvent(session, "finished", 11);
  expect(received).toHaveLength(4);
  const ids = received.map(
    (event) => (event as { sessionId: string }).sessionId,
  );
  expect(new Set(ids).size).toBe(1);
  expect(ids[0]).not.toBe(session);
  expect(received[3]).toEqual({
    event: "walkthrough_finished",
    sessionId: ids[0],
    properties: {
      tour: "coffee-shop",
      phase: 11,
      elapsedSeconds: expect.any(Number),
      completedPhases: 1,
      allExercisesCompleted: false,
    },
  });
  reportCoffeeShopEvent(randomUUID(), "opened", 0);
  expect((received[4] as { sessionId: string }).sessionId).not.toBe(ids[0]);
});

it("distinguishes finishing every exercise from skipping to the last screen", () => {
  events.subscribe(collect);
  const session = randomUUID();
  for (let phase = 1; phase <= 10; phase++)
    reportCoffeeShopEvent(session, "phase_completed", phase);
  reportCoffeeShopEvent(session, "finished", 11);
  expect(received[11]).toMatchObject({
    properties: { completedPhases: 10, allExercisesCompleted: true },
  });
});

it("credits completing skipped exercises after first reaching the final screen", () => {
  events.subscribe(collect);
  const session = randomUUID();
  reportCoffeeShopEvent(session, "lesson_skipped", 1);
  reportCoffeeShopEvent(session, "finished", 11);
  for (let phase = 1; phase <= 10; phase++)
    reportCoffeeShopEvent(session, "phase_completed", phase);
  reportCoffeeShopEvent(session, "phase_completed", 10);
  const completed = received.filter(
    (event) => (event as { event: string }).event === "walkthrough_completed",
  );
  expect(completed).toHaveLength(1);
});

it("rejects unknown names, free text, invalid phases, and invalid event/phase combinations", () => {
  events.subscribe(collect);
  const session = randomUUID();
  for (const [event, step] of [
    ["/private/project/secret", 1],
    ["phase_completed", "1"],
    ["phase_completed", 1.5],
    ["phase_completed", -1],
    ["phase_completed", 12],
    ["phase_completed", 0],
    ["phase_completed", 11],
    ["opened", 1],
    ["started", 1],
    ["finished", 5],
    ["lesson_skipped", 11],
    [null, 0],
    ["opened", NaN],
  ])
    reportCoffeeShopEvent(session, event, step);
  expect(received).toEqual([]);
});

it("does not forward the simulator local session identifier", () => {
  events.subscribe(collect);
  reportCoffeeShopEvent("/private/project/secret", "lesson_skipped", 7);
  expect(JSON.stringify(received)).not.toContain("/private/project/secret");
  expect(received[0]).toMatchObject({
    event: "walkthrough_lesson_skipped",
    properties: { phase: 7 },
  });
});

it("keeps version 2 lesson numbering and rejects new lessons for older callers", () => {
  events.subscribe(collect);
  const session = randomUUID();
  reportWalkthroughEvent(session, "phase_completed", "catalog");
  expect(received.at(-1)).toMatchObject({
    properties: {
      walkthroughVersion: 2,
      lesson: PHASES_V2.find((phase) => phase.id === "catalog")!.lesson,
    },
  });
  const count = received.length;
  reportWalkthroughEvent(session, "phase_completed", "name-example");
  expect(received).toHaveLength(count);
  reportWalkthroughEvent(session, "phase_completed", "catalog", 3);
  expect(received.at(-1)).toMatchObject({
    properties: { walkthroughVersion: 3, lesson: 3 },
  });
});

it("versions stable lesson phases and derives completion from the current lesson inventory", () => {
  events.subscribe(collect);
  const session = randomUUID();
  for (const phase of PHASES) {
    reportWalkthroughEvent(session, "phase_completed", phase.id, 4);
    reportWalkthroughEvent(session, "phase_completed", phase.id, 4);
  }
  reportWalkthroughEvent(session, "finished", PHASES.at(-1)!.id, 4);
  expect(
    received.filter(
      (event) => (event as { event: string }).event === "walkthrough_completed",
    ),
  ).toHaveLength(1);
  expect(received.at(-1)).toMatchObject({
    properties: {
      walkthroughVersion: 4,
      completedPhases: PHASES.length,
      allExercisesCompleted: true,
    },
  });
  const count = received.length;
  reportWalkthroughEvent(session, "phase_completed", "private-path-or-unknown");
  reportWalkthroughEvent(session, "opened", "reduce");
  expect(received).toHaveLength(count);
  expect(JSON.stringify(received)).not.toContain("private-path-or-unknown");
});
