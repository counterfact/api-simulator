import { jest } from "@jest/globals";
import { usingTemporaryFiles } from "using-temporary-files";
import type { HarPredicate } from "@counterfact/types";
import {
  HarCollection,
  createHarRequest,
} from "../../src/server/har-collection.js";

function exchange(
  url = "https://recorded.example/api/items?a=1&b=2",
  text = "recorded",
  options: {
    method?: string;
    rawBody?: string;
    contentType?: string;
    status?: number;
  } = {},
) {
  return {
    request: {
      method: options.method ?? "GET",
      url,
      headers: options.contentType
        ? [{ name: "Content-Type", value: options.contentType }]
        : [],
      ...(options.rawBody === undefined
        ? {}
        : {
            postData: { text: options.rawBody, mimeType: options.contentType },
          }),
    },
    response: {
      status: options.status ?? 200,
      headers: [{ name: "Content-Type", value: "text/plain" }],
      content: { text, mimeType: "text/plain" },
    },
  };
}
function archive(entries: unknown[]) {
  return JSON.stringify({ log: { version: "1.2", entries } });
}
function incoming(
  url = "/api/items?b=2&a=1",
  options: { method?: string; rawBody?: string; contentType?: string } = {},
) {
  return createHarRequest({
    method: options.method ?? "GET",
    url,
    rawBody: options.rawBody,
    headers: options.contentType ? { "Content-Type": options.contentType } : {},
  });
}
function response(value: unknown) {
  return value as {
    body?: string | Uint8Array;
    status: number;
    headers: Record<string, string[]>;
  };
}

describe("HAR lookup", () => {
  it("loads nested files in stable order, ignores origins/query name order and never consumes a match", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("har/z.har", archive([exchange(undefined, "later")]));
      await $.add(
        "har/a/first.har",
        archive([exchange(), exchange(undefined, "second")]),
      );
      const collection = new HarCollection($.path("."));
      await collection.load();
      const lookup = collection.lookup(incoming());
      expect(response(lookup()).body).toBe("recorded");
      expect(response(lookup()).body).toBe("recorded");
      expect(collection.lookup(incoming("/items?b=2&a=1"))()).toBeUndefined();
      expect(
        collection.lookup(incoming(undefined, { method: "POST" }))(),
      ).toBeUndefined();
      expect(
        collection.lookup(incoming("/api/items?b=3&a=1"))(),
      ).toBeUndefined();
    });
  });

  it("preserves duplicate query values and their order without coercing them", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "har/one.har",
        archive([exchange("https://example.test/items?q=01&q=2")]),
      );
      const collection = new HarCollection($.path("."));
      await collection.load();
      expect(collection.lookup(incoming("/items?q=01&q=2"))()).toBeDefined();
      expect(collection.lookup(incoming("/items?q=1&q=2"))()).toBeUndefined();
      expect(collection.lookup(incoming("/items?q=2&q=01"))()).toBeUndefined();
      expect(collection.lookup(incoming("/items?q=01"))()).toBeUndefined();
    });
  });

  it.each([
    [
      "application/json",
      '{"a":1,"b":[2,3]}',
      '{"b":[2,3],"a":1}',
      '{"a":1,"b":[3,2]}',
    ],
    ["application/x-www-form-urlencoded", "a=1&b=2", "b=2&a=1", "a=2&b=2"],
    ["text/plain", "exact text", "exact text", "different text"],
  ])(
    "matches %s request bodies",
    async (contentType, recorded, same, different) => {
      await usingTemporaryFiles(async ($) => {
        await $.add(
          "har/one.har",
          archive([
            exchange("https://example.test/items", "body", {
              method: "POST",
              contentType,
              rawBody: recorded,
            }),
          ]),
        );
        const collection = new HarCollection($.path("."));
        await collection.load();
        expect(
          collection.lookup(
            incoming("/items", { method: "POST", contentType, rawBody: same }),
          )(),
        ).toBeDefined();
        expect(
          collection.lookup(
            incoming("/items", {
              method: "POST",
              contentType,
              rawBody: different,
            }),
          )(),
        ).toBeUndefined();
      });
    },
  );

  it("distinguishes absent and empty bodies and does not guess omitted or multipart payloads", async () => {
    await usingTemporaryFiles(async ($) => {
      const omitted = exchange("https://example.test/items", "omitted", {
        method: "POST",
      });
      Object.assign(omitted.request, {
        postData: { mimeType: "application/json" },
      });
      await $.add(
        "har/one.har",
        archive([
          omitted,
          exchange("https://example.test/items", "empty", {
            method: "POST",
            rawBody: "",
          }),
        ]),
      );
      const collection = new HarCollection($.path("."));
      await collection.load();
      expect(
        collection.lookup(incoming("/items", { method: "POST" }))(),
      ).toBeUndefined();
      expect(
        response(
          collection.lookup(
            incoming("/items", { method: "POST", rawBody: "" }),
          )(),
        ).body,
      ).toBe("empty");
      expect(
        collection.lookup(
          incoming("/items", {
            method: "POST",
            rawBody: "",
            contentType: "multipart/form-data; boundary=a",
          }),
        )(),
      ).toBeUndefined();
      expect(
        response(collection.lookup(incoming("/items"))(() => true)).body,
      ).toBe("omitted");
    });
  });

  it("replaces default matching, isolates predicate arguments and results, and propagates errors", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("har/one.har", archive([exchange()]));
      const collection = new HarCollection($.path("."));
      await collection.load();
      const lookup = collection.lookup(incoming("/different"));
      expect(
        response(
          lookup(({ request, entry }) => {
            expect(request.pathname).toBe("/different");
            expect(entry.filename).toBe("one.har");
            Reflect.set(entry.response, "body", "mutated");
            Reflect.set(request, "pathname", "/mutated");
            return true;
          }),
        ).body,
      ).toBe("recorded");
      const first = response(lookup(() => true));
      first.headers["content-type"]?.push("mutated");
      expect(response(lookup(() => true)).headers["content-type"]).toEqual([
        "text/plain",
      ]);
      expect(() =>
        lookup(() => {
          throw new Error("predicate failed");
        }),
      ).toThrow("predicate failed");
      const asynchronous = (async () => true) as unknown as HarPredicate;
      expect(() => lookup(asynchronous)).toThrow(
        "synchronously return a boolean",
      );
    });
  });

  it("preserves response bytes, status and repeated headers while stripping transport headers", async () => {
    await usingTemporaryFiles(async ($) => {
      const entry = exchange();
      Object.assign(entry.response, {
        status: 201,
        headers: [
          { name: "Set-Cookie", value: "a=1" },
          { name: "Set-Cookie", value: "b=2" },
          { name: "Content-Encoding", value: "gzip" },
          { name: "Content-Length", value: "999" },
          { name: "Connection", value: "X-Hop" },
          { name: "X-Hop", value: "drop" },
        ],
        content: {
          encoding: "base64",
          text: "AAH/",
          mimeType: "application/octet-stream",
        },
      });
      await $.add("har/one.har", archive([entry]));
      const collection = new HarCollection($.path("."));
      await collection.load();
      const result = response(collection.lookup(incoming())());
      expect(result.status).toBe(201);
      expect([...(result.body as Uint8Array)]).toEqual([0, 1, 255]);
      expect(result.headers).toEqual({ "set-cookie": ["a=1", "b=2"] });
      (result.body as Uint8Array)[0] = 42;
      expect([
        ...(response(collection.lookup(incoming())()).body as Uint8Array),
      ]).toEqual([0, 1, 255]);
    });
  });

  it("skips unavailable content but preserves valid empty responses and identifies the source", async () => {
    await usingTemporaryFiles(async ($) => {
      const missing = exchange();
      Object.assign(missing.response, { content: { size: 10 } });
      const empty = exchange(undefined, "", { status: 204 });
      Object.assign(empty.response, { content: {} });
      const report = jest.fn();
      await $.add("har/one.har", archive([missing, empty]));
      const collection = new HarCollection($.path("."), report);
      await collection.load();
      expect(response(collection.lookup(incoming())()).status).toBe(204);
      expect(report).toHaveBeenCalledWith(
        expect.stringContaining('"one.har" entry 0: skipped'),
      );
    });
  });

  it("accepts missing directories and rejects invalid archives with filename diagnostics", async () => {
    await usingTemporaryFiles(async ($) => {
      const collection = new HarCollection($.path("."));
      await collection.load();
      expect(collection.lookup(incoming())()).toBeUndefined();
      await $.add("har/bad.har", "{broken secret payload");
      await expect(collection.load()).rejects.toThrow("bad.har");
      await $.add("har/bad.har", '{"log":{}}');
      await expect(collection.load()).rejects.toThrow("log.entries");
    });
  });

  it("does not share recordings between instances", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("first/har/one.har", archive([exchange()]));
      const first = new HarCollection($.path("first"));
      const second = new HarCollection($.path("second"));
      await Promise.all([first.load(), second.load()]);
      expect(first.lookup(incoming())()).toBeDefined();
      expect(second.lookup(incoming())()).toBeUndefined();
    });
  });
});

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("HAR reload did not complete");
}

it("reloads a newly created directory, retains the last good data after an invalid edit, then recovers and removes files", async () => {
  await usingTemporaryFiles(async ($) => {
    const report = jest.fn();
    const collection = new HarCollection($.path("."), report);
    await collection.load();
    await collection.watch();
    try {
      const added = waitUntil(
        () => response(collection.lookup(incoming())() ?? {}).body === "first",
      );
      await $.add(
        "har/nested/one.har",
        archive([exchange(undefined, "first")]),
      );
      await added;
      const invalid = waitUntil(() =>
        report.mock.calls.some(([message]) =>
          message.includes("retaining the last good collection"),
        ),
      );
      await $.add("har/nested/one.har", "invalid secret payload");
      await invalid;
      expect(response(collection.lookup(incoming())()).body).toBe("first");
      expect(report.mock.calls.flat().join(" ")).not.toContain(
        "secret payload",
      );
      const changed = waitUntil(
        () => response(collection.lookup(incoming())() ?? {}).body === "second",
      );
      await $.add(
        "har/nested/one.har",
        archive([exchange(undefined, "second")]),
      );
      await changed;
      const removed = waitUntil(
        () => collection.lookup(incoming())() === undefined,
      );
      await $.remove("har/nested/one.har");
      await removed;
    } finally {
      await collection.stopWatching();
    }
    await $.add("har/nested/one.har", archive([exchange()]));
    expect(collection.lookup(incoming())()).toBeUndefined();
  });
});

it("matches URL-encoded HAR params when the exporter omits postData.text", async () => {
  await usingTemporaryFiles(async ($) => {
    const entry = exchange("https://example.test/items", "form", {
      method: "POST",
    });
    Object.assign(entry.request, {
      postData: {
        mimeType: "application/x-www-form-urlencoded",
        params: [
          { name: "Case", value: "1" },
          { name: "Case", value: "2" },
        ],
      },
    });
    await $.add("har/one.har", archive([entry]));
    const collection = new HarCollection($.path("."));
    await collection.load();
    expect(
      response(
        collection.lookup(
          incoming("/items", {
            method: "POST",
            contentType: "application/x-www-form-urlencoded",
            rawBody: "Case=1&Case=2",
          }),
        )(),
      ).body,
    ).toBe("form");
  });
});

it("composes default matching with named component and header comparisons", async () => {
  await usingTemporaryFiles(async ($) => {
    const entry = exchange(
      "https://recorded.example/items?kind=one&tag=a&tag=b",
      "selected",
      {
        method: "POST",
        rawBody: '{"a":1,"b":2}',
        contentType: "application/json",
      },
    );
    entry.request.headers.push(
      { name: "X-ID", value: "first" },
      { name: "x-id", value: "second" },
    );
    await $.add("har/one.har", archive([entry]));
    const collection = new HarCollection($.path("."));
    await collection.load();
    const request = createHarRequest({
      method: "POST",
      url: "/items?tag=a&tag=b&kind=one",
      rawBody: '{"b":2,"a":1}',
      headers: {
        "Content-Type": "application/json",
        "X-ID": ["first", "second"],
      },
    });
    const lookup = collection.lookup(request);
    expect(
      response(
        lookup(({ defaultMatch, match, request: actual, entry: recorded }) => {
          expect(actual.pathname).toBe(recorded.request.pathname);
          expect(defaultMatch).toBe(true);
          expect(match("method")).toBe(true);
          expect(match("pathname")).toBe(true);
          expect(match("body")).toBe(true);
          expect(match("rawBody")).toBe(false);
          expect(match("headers")).toBe(true);
          expect(match("query")).toBe(true);
          expect(match("query", "kind")).toBe(true);
          expect(match("query", "Kind")).toBe(true); // absent on both sides
          expect(match("header", "missing")).toBe(true);
          expect(match("bodyAvailable")).toBe(true);
          Reflect.set(actual, "pathname", "/mutated");
          Reflect.set(recorded.request, "pathname", "/other");
          expect(match("pathname")).toBe(true);
          return defaultMatch && match("header", "X-Id");
        }),
      ).body,
    ).toBe("selected");
    const mismatch = collection.lookup({
      ...request,
      headers: { ...request.headers, "x-id": ["second", "first"] },
    });
    expect(
      mismatch(
        ({ defaultMatch, match }) => defaultMatch && match("header", "x-id"),
      ),
    ).toBeUndefined();
    const otherQuery = collection.lookup({
      ...request,
      query: { kind: ["other"] },
    });
    expect(
      response(
        otherQuery(({ defaultMatch, match }) => {
          expect(defaultMatch).toBe(false);
          expect(match("query", "kind")).toBe(false);
          return match("pathname");
        }),
      ).body,
    ).toBe("selected");
  });
});
