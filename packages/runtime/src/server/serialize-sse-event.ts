import type { SseEvent } from "@counterfact/types";

/** Serialize explicit SSE frames without interpreting ordinary JSON payloads. */
export function serializeSseEvent(value: unknown): string {
  if (value === null || typeof value !== "object") {
    throw new TypeError("SSE frames must be objects with string fields.");
  }

  const frame = value as SseEvent;
  const lines: string[] = [];

  // Field names are a fixed allowlist, never taken from frame input.
  for (const field of ["comment", "event", "id", "data"] as const) {
    // eslint-disable-next-line security/detect-object-injection -- field is from the fixed allowlist above.
    const text = frame[field];

    if (text === undefined) continue;
    if (typeof text !== "string") {
      throw new TypeError(`SSE ${field} must be a string.`);
    }
    if ((field === "event" || field === "id") && /[\r\n]/u.test(text)) {
      throw new TypeError(`SSE ${field} must not contain line breaks.`);
    }
    if (field === "id" && text.includes("\0")) {
      throw new TypeError("SSE id must not contain a null character.");
    }

    for (const line of text.split(/\r\n|\r|\n/u)) {
      lines.push(field === "comment" ? `: ${line}` : `${field}: ${line}`);
    }
  }

  if (frame.retry !== undefined) {
    if (!Number.isSafeInteger(frame.retry) || frame.retry < 0) {
      throw new TypeError("SSE retry must be a nonnegative safe integer.");
    }
    lines.push(`retry: ${frame.retry}`);
  }

  return `${lines.join("\n")}\n\n`;
}
