const pages = {
  start: {
    items: [
      { id: "T-1", title: "Login fails" },
      { id: "T-2", title: "Invoice missing" },
    ],
    nextCursor: "page-2",
  },
  "page-2": {
    items: [
      { id: "T-2", title: "Invoice missing (duplicate)" },
      { id: "T-3", title: "Export is slow" },
    ],
    nextCursor: "page-3",
  },
  "page-3": { items: [{ id: "T-4", title: "Password reset" }] },
} as const;

// The benchmark fixture is deliberately decoupled from generated route types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GET = ($: any) => {
  const cursor = $.query.cursor || "start";
  const attempt = $.context.nextAttempt(cursor);

  if ($.context.scenario === "bad-request") {
    $.context.record(cursor, 400);
    return $.response[400].json({ message: "Invalid cursor" });
  }

  if ($.context.scenario === "permanent-429") {
    $.context.record(cursor, 429);
    return $.response[429]
      .header("Retry-After", "0.02")
      .json({ message: "Try again later" });
  }

  if (
    $.context.scenario === "rate-limit" &&
    cursor === "start" &&
    attempt === 1
  ) {
    $.context.record(cursor, 429);
    return $.response[429]
      .header("Retry-After", "0.02")
      .json({ message: "Try again shortly" });
  }

  if (
    $.context.scenario === "transient-503" &&
    cursor === "page-2" &&
    attempt <= 2
  ) {
    $.context.record(cursor, 503);
    return $.response[503].json({ message: "Temporarily unavailable" });
  }

  const page = pages[cursor as keyof typeof pages];
  if (!page) {
    $.context.record(cursor, 400);
    return $.response[400].json({ message: "Invalid cursor" });
  }

  $.context.record(cursor, 200);
  return $.response[200].json(page);
};
