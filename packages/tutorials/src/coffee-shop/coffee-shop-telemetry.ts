import { randomUUID } from "node:crypto";
import { channel } from "node:diagnostics_channel";

// The host owns transport and consent. Tutorials never contact an analytics service.
const events = channel("counterfact:walkthrough");
const sessions = new Map<
  string,
  {
    id: string;
    startedAt: number;
    reported: Set<string>;
    completed: Set<number>;
  }
>();

/** Accept only bounded milestone data from the generated local route. */
export function reportCoffeeShopEvent(
  sessionId: string,
  event: unknown,
  step: unknown,
): void {
  if (!events.hasSubscribers || !Number.isInteger(step)) return;
  const phase = step as number;
  if (
    typeof event !== "string" ||
    ![
      "opened",
      "started",
      "phase_completed",
      "lesson_skipped",
      "finished",
    ].includes(event)
  )
    return;
  if (phase < 0 || phase > 11) return;
  if ((event === "opened" || event === "started") && phase !== 0) return;
  if (event === "phase_completed" && (phase < 1 || phase > 10)) return;
  if (event === "lesson_skipped" && phase === 11) return;
  if (event === "finished" && phase !== 11) return;
  try {
    let session = sessions.get(sessionId);
    if (!session) {
      // Bound retained state even when a host runs many simulator sessions.
      if (sessions.size >= 128) sessions.delete(sessions.keys().next().value!);
      session = {
        id: randomUUID(),
        startedAt: Date.now(),
        reported: new Set(),
        completed: new Set(),
      };
      sessions.set(sessionId, session);
    }
    const key = event + ":" + phase;
    if (session.reported.has(key)) return;
    if (event === "phase_completed") session.completed.add(phase);
    events.publish({
      event: "walkthrough_" + event,
      sessionId: session.id,
      properties: {
        tour: "coffee-shop",
        phase,
        elapsedSeconds: Math.floor((Date.now() - session.startedAt) / 1000),
        ...(event === "finished"
          ? {
              completedPhases: session.completed.size,
              allExercisesCompleted: session.completed.size === 10,
            }
          : {}),
      },
    });
    session.reported.add(key);
    if (session.completed.size === 10 && !session.reported.has("completed")) {
      events.publish({
        event: "walkthrough_completed",
        sessionId: session.id,
        properties: {
          tour: "coffee-shop",
          elapsedSeconds: Math.floor((Date.now() - session.startedAt) / 1000),
        },
      });
      session.reported.add("completed");
    }
  } catch {
    // Reporting must never interrupt an exercise or expose a transport failure.
  }
}
