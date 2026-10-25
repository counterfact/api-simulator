import { channel } from "node:diagnostics_channel";

import { sendTelemetry } from "./telemetry.js";

let enabled = false;

/** Subscribe once per CLI process, including when an existing tour is restarted. */
export function enableWalkthroughTelemetry(version: string): void {
  if (enabled) return;
  enabled = true;
  channel("counterfact:walkthrough").subscribe((message) => {
    const { event, properties, sessionId } = message as {
      event: string;
      properties: Record<string, unknown>;
      sessionId: string;
    };
    sendTelemetry(event, { ...properties, version }, sessionId);
  });
}
