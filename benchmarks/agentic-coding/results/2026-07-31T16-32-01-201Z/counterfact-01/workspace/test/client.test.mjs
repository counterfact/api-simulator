import assert from "node:assert/strict";
import test from "node:test";
import { fetchAllTickets } from "../src/client.mjs";

async function withFetch(responses, callback) {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    const response = responses.shift();
    if (!response) throw new Error("Unexpected request");
    return response;
  };

  try {
    return await callback(requests);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function jsonResponse(status, body, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}

test("follows cursors and keeps the first ticket for duplicate ids", async () => {
  await withFetch(
    [
      jsonResponse(200, {
        items: [{ id: "a", title: "first" }, { id: "b", title: "two" }],
        nextCursor: "page-2",
      }),
      jsonResponse(200, {
        items: [{ id: "a", title: "duplicate" }, { id: "c", title: "three" }],
      }),
    ],
    async (requests) => {
      const tickets = await fetchAllTickets({ baseUrl: "https://example.test/api" });
      assert.deepEqual(tickets, [
        { id: "a", title: "first" },
        { id: "b", title: "two" },
        { id: "c", title: "three" },
      ]);
      assert.deepEqual(requests, [
        "https://example.test/api/tickets",
        "https://example.test/api/tickets?cursor=page-2",
      ]);
    },
  );
});

test("retries retryable responses and honors Retry-After seconds", async () => {
  await withFetch(
    [
      jsonResponse(429, { message: "slow down" }, { "Retry-After": "2.5" }),
      jsonResponse(503, { message: "temporarily unavailable" }),
      jsonResponse(200, { items: [] }),
    ],
    async () => {
      const delays = [];
      await fetchAllTickets({
        baseUrl: "https://example.test",
        sleep: async (milliseconds) => delays.push(milliseconds),
      });
      assert.deepEqual(delays, [2500, 2000]);
    },
  );
});

test("does not retry non-retryable failures", async () => {
  await withFetch([jsonResponse(400, { message: "invalid cursor" })], async () => {
    await assert.rejects(
      fetchAllTickets({ baseUrl: "https://example.test", sleep: async () => assert.fail() }),
      /HTTP 400: invalid cursor/,
    );
  });
});

test("stops after maxRetries", async () => {
  await withFetch(
    [
      jsonResponse(503, { message: "one" }),
      jsonResponse(503, { message: "two" }),
      jsonResponse(503, { message: "three" }),
    ],
    async () => {
      const delays = [];
      await assert.rejects(
        fetchAllTickets({
          baseUrl: "https://example.test",
          maxRetries: 2,
          sleep: async (milliseconds) => delays.push(milliseconds),
        }),
        /HTTP 503: three/,
      );
      assert.deepEqual(delays, [1000, 2000]);
    },
  );
});
