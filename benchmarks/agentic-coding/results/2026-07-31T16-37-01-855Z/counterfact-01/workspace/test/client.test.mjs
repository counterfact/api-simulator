import assert from "node:assert/strict";
import test from "node:test";

import { fetchAllTickets } from "../src/client.mjs";

async function withFetch(mock, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("collects cursor pages in order and keeps the first duplicate", { concurrency: false }, async () => {
  const urls = [];
  await withFetch(async (url) => {
    urls.push(String(url));
    if (urls.length === 1) {
      return Response.json({
        items: [{ id: "one", title: "Original" }, { id: "two", title: "Second" }],
        nextCursor: "next page",
      });
    }
    return Response.json({
      items: [{ id: "two", title: "Duplicate" }, { id: "three", title: "Third" }],
    });
  }, async () => {
    const tickets = await fetchAllTickets({ baseUrl: "https://tickets.example/api" });
    assert.deepEqual(tickets, [
      { id: "one", title: "Original" },
      { id: "two", title: "Second" },
      { id: "three", title: "Third" },
    ]);
  });

  assert.deepEqual(urls, [
    "https://tickets.example/api/tickets",
    "https://tickets.example/api/tickets?cursor=next+page",
  ]);
});

test("retries rate limits and honors Retry-After", { concurrency: false }, async () => {
  let calls = 0;
  const delays = [];
  await withFetch(async () => {
    calls += 1;
    if (calls === 1) {
      return Response.json({ message: "Slow down" }, {
        status: 429,
        headers: { "Retry-After": "0.25" },
      });
    }
    return Response.json({ items: [] });
  }, async () => {
    assert.deepEqual(await fetchAllTickets({
      baseUrl: "https://tickets.example",
      sleep: async (milliseconds) => delays.push(milliseconds),
    }), []);
  });

  assert.equal(calls, 2);
  assert.deepEqual(delays, [250]);
});

test("retries 5xx responses with exponential fallback backoff", { concurrency: false }, async () => {
  let calls = 0;
  const delays = [];
  await withFetch(async () => {
    calls += 1;
    if (calls < 3) return Response.json({ message: "Unavailable" }, { status: 503 });
    return Response.json({ items: [] });
  }, async () => {
    await fetchAllTickets({
      baseUrl: "https://tickets.example",
      sleep: async (milliseconds) => delays.push(milliseconds),
    });
  });

  assert.equal(calls, 3);
  assert.deepEqual(delays, [100, 200]);
});

test("does not retry other 4xx responses", { concurrency: false }, async () => {
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    return Response.json({ message: "Invalid cursor" }, { status: 400 });
  }, async () => {
    await assert.rejects(
      fetchAllTickets({ baseUrl: "https://tickets.example" }),
      /HTTP 400.*Invalid cursor/,
    );
  });

  assert.equal(calls, 1);
});

test("throws after the configured number of retry attempts", { concurrency: false }, async () => {
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    return Response.json({ message: "Still limited" }, { status: 429 });
  }, async () => {
    await assert.rejects(
      fetchAllTickets({
        baseUrl: "https://tickets.example",
        maxRetries: 2,
        sleep: async () => {},
      }),
      /HTTP 429 after 3 attempts.*Still limited/,
    );
  });

  assert.equal(calls, 3);
});
