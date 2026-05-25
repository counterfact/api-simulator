import { describe, expect, it, jest } from "@jest/globals";

import { ChaosRegistry, ChaosRule } from "../../src/server/chaos.js";
import { ContextRegistry } from "../../src/server/context-registry.js";
import { Dispatcher } from "../../src/server/dispatcher.js";
import { Registry } from "../../src/server/registry.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of iterations for probability boundary tests. */
const PROBABILITY_TEST_ITERATIONS = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDispatcher(chaosRegistry: ChaosRegistry): Dispatcher {
  const registry = new Registry();

  registry.add("/orders", {
    GET() {
      return {
        body: JSON.stringify({ id: 1, status: "pending" }),
        contentType: "application/json",
        headers: { "x-original": "yes" },
        status: 200,
      };
    },
  });

  registry.add("/users", {
    GET() {
      return {
        body: "user list",
        contentType: "text/plain",
        status: 200,
      };
    },
  });

  return new Dispatcher(
    registry,
    new ContextRegistry(),
    undefined,
    { validateRequests: false, validateResponses: false },
    "",
    [],
    chaosRegistry,
  );
}

async function get(dispatcher: Dispatcher, path: string) {
  return dispatcher.request({
    body: "",
    headers: {},
    method: "GET",
    path,
    query: {},
    req: { path },
  });
}

// ---------------------------------------------------------------------------
// ChaosRule unit tests
// ---------------------------------------------------------------------------

describe("ChaosRule", () => {
  describe("tryApply", () => {
    it("returns null when the rule is stopped", () => {
      const rule = new ChaosRule("").next(1).stop();
      const response = { body: "ok", status: 200 };
      expect(rule.tryApply(response)).toBeNull();
    });

    it("returns null when remaining count is exhausted", () => {
      const rule = new ChaosRule("").next(1);
      const response = { body: "ok", status: 200 };
      rule.tryApply(response); // fires once → count → 0
      expect(rule.tryApply(response)).toBeNull();
    });

    it("returns null with probability(0)", () => {
      const rule = new ChaosRule("").always().probability(0);
      const response = { body: "ok", status: 200 };
      // With probability 0, every call returns null
      for (let i = 0; i < PROBABILITY_TEST_ITERATIONS; i++) {
        expect(rule.tryApply(response)).toBeNull();
      }
    });

    it("always fires with probability(1)", () => {
      const rule = new ChaosRule("").always().probability(1);
      const response = { body: "ok", status: 200 };
      for (let i = 0; i < PROBABILITY_TEST_ITERATIONS; i++) {
        expect(rule.tryApply(response)).not.toBeNull();
      }
    });

    it("throws when probability is outside [0, 1]", () => {
      const rule = new ChaosRule("").always();

      expect(() => rule.probability(-0.1)).toThrow(
        "Chaos rule probability must be a number between 0 and 1",
      );
      expect(() => rule.probability(1.1)).toThrow(
        "Chaos rule probability must be a number between 0 and 1",
      );
      expect(() => rule.probability(Number.NaN)).toThrow(
        "Chaos rule probability must be a number between 0 and 1",
      );
    });

    it("overrides status code", () => {
      const rule = new ChaosRule("").always().status(500);
      const result = rule.tryApply({ body: "ok", status: 200 });
      expect(result?.response.status).toBe(500);
    });

    it("adds a header", () => {
      const rule = new ChaosRule("").always().header("Retry-After", "60");
      const result = rule.tryApply({ body: "ok", status: 200, headers: {} });
      expect(result?.response.headers?.["Retry-After"]).toBe("60");
    });

    it("does not allow overriding Content-Type with header()", () => {
      const rule = new ChaosRule("")
        .always()
        .header("Content-Type", "text/xml");
      const result = rule.tryApply({
        body: "ok",
        contentType: "application/json",
        status: 200,
      });
      expect(result?.response.contentType).toBe("application/json");
      expect(result?.response.headers?.["Content-Type"]).toBeUndefined();
    });

    it("removes a header", () => {
      const rule = new ChaosRule("").always().removeHeader("x-original");
      const result = rule.tryApply({
        body: "ok",
        status: 200,
        headers: { "x-original": "yes", keep: "this" },
      });
      expect(result?.response.headers?.["x-original"]).toBeUndefined();
      expect(result?.response.headers?.["keep"]).toBe("this");
    });

    it("does not allow removing Content-Type with removeHeader()", () => {
      const rule = new ChaosRule("").always().removeHeader("content-type");
      const result = rule.tryApply({
        body: "ok",
        contentType: "application/json",
        status: 200,
      });
      expect(result?.response.contentType).toBe("application/json");
      expect(result?.response.headers).toEqual({});
    });

    it("replaces the body", () => {
      const rule = new ChaosRule("").always().body({ error: true });
      const result = rule.tryApply({ body: "original", status: 200 });
      expect(result?.response.body).toEqual({ error: true });
    });

    it("transforms the body", () => {
      const rule = new ChaosRule("")
        .always()
        .transformBody((b) => `${b}-modified`);
      const result = rule.tryApply({ body: "original", status: 200 });
      expect(result?.response.body).toBe("original-modified");
    });

    it("sets delayMs from delay()", () => {
      const rule = new ChaosRule("").always().delay(1_000);
      const result = rule.tryApply({ body: "ok", status: 200 });
      expect(result?.delayMs).toBe(1_000);
    });

    it("does not set delayMs when no delay is configured", () => {
      const rule = new ChaosRule("").always().status(500);
      const result = rule.tryApply({ body: "ok", status: 200 });
      expect(result?.delayMs).toBeUndefined();
    });

    it("preserves the original response fields not explicitly changed", () => {
      const rule = new ChaosRule("").always().status(500);
      const result = rule.tryApply({
        body: "hello",
        contentType: "text/plain",
        headers: { "x-custom": "val" },
        status: 200,
      });
      expect(result?.response.body).toBe("hello");
      expect(result?.response.contentType).toBe("text/plain");
      expect(result?.response.headers?.["x-custom"]).toBe("val");
    });
  });

  describe("next()", () => {
    it("applies exactly once when next() is called with no argument", () => {
      const rule = new ChaosRule("").next().status(500);
      const resp = { body: "ok", status: 200 };
      expect(rule.tryApply(resp)?.response.status).toBe(500);
      expect(rule.tryApply(resp)).toBeNull();
    });

    it("applies exactly count times when next(count) is called", () => {
      const rule = new ChaosRule("").next(3).status(500);
      const resp = { body: "ok", status: 200 };
      for (let i = 0; i < 3; i++) {
        expect(rule.tryApply(resp)?.response.status).toBe(500);
      }
      expect(rule.tryApply(resp)).toBeNull();
    });

    it("does not decrement the count when probability skips the response", () => {
      // Use probability(0) to ensure every check is skipped
      const rule = new ChaosRule("").next(2).probability(0);
      const resp = { body: "ok", status: 200 };
      // These calls are all skipped; count should not decrement
      rule.tryApply(resp);
      rule.tryApply(resp);
      rule.tryApply(resp);
      // Switch to probability(1) – count should still be 2
      rule.probability(1);
      expect(rule.tryApply(resp)).not.toBeNull();
      expect(rule.tryApply(resp)).not.toBeNull();
      expect(rule.tryApply(resp)).toBeNull();
    });

    it("does not decrement the count when the rule is stopped", () => {
      const rule = new ChaosRule("").next(2).stop();
      const resp = { body: "ok", status: 200 };
      rule.tryApply(resp);
      rule.tryApply(resp);
      // Re-enable; count should still be 2
      rule.start();
      expect(rule.tryApply(resp)).not.toBeNull();
      expect(rule.tryApply(resp)).not.toBeNull();
      expect(rule.tryApply(resp)).toBeNull();
    });
  });

  describe("always()", () => {
    it("continues to apply indefinitely", () => {
      const rule = new ChaosRule("").always().status(500);
      const resp = { body: "ok", status: 200 };
      for (let i = 0; i < 50; i++) {
        expect(rule.tryApply(resp)?.response.status).toBe(500);
      }
    });
  });

  describe("stop() / start()", () => {
    it("stop() disables the rule", () => {
      const rule = new ChaosRule("").always().status(500);
      rule.stop();
      expect(rule.tryApply({ body: "ok", status: 200 })).toBeNull();
    });

    it("start() re-enables a stopped rule", () => {
      const rule = new ChaosRule("").always().status(500);
      rule.stop();
      rule.start();
      expect(rule.tryApply({ body: "ok", status: 200 })?.response.status).toBe(
        500,
      );
    });
  });

  describe("body() vs transformBody()", () => {
    it("body() clears a previously set transformBody()", () => {
      const rule = new ChaosRule("").always();
      rule.transformBody((b) => `${b}-transformed`);
      rule.body("static");
      const result = rule.tryApply({ body: "original", status: 200 });
      expect(result?.response.body).toBe("static");
    });

    it("transformBody() clears a previously set body()", () => {
      const rule = new ChaosRule("").always();
      rule.body("static");
      rule.transformBody((b) => `${b}-transformed`);
      const result = rule.tryApply({ body: "original", status: 200 });
      expect(result?.response.body).toBe("original-transformed");
    });
  });
});

// ---------------------------------------------------------------------------
// ChaosRegistry unit tests
// ---------------------------------------------------------------------------

describe("ChaosRegistry", () => {
  describe("findBestMatch", () => {
    it("returns undefined when no rules are registered", () => {
      const registry = new ChaosRegistry();
      expect(registry.findBestMatch("/orders")).toBeUndefined();
    });

    it("matches a global rule (empty prefix) against any path", () => {
      const registry = new ChaosRegistry();
      const rule = registry.createRule("").always().status(500);
      expect(registry.findBestMatch("/anything")).toBe(rule);
    });

    it("matches a prefix-scoped rule only when path starts with prefix", () => {
      const registry = new ChaosRegistry();
      const rule = registry.createRule("/orders").always().status(500);
      expect(registry.findBestMatch("/orders/123")).toBe(rule);
      expect(registry.findBestMatch("/users")).toBeUndefined();
    });

    it("does not match /inventory/orders for prefix /orders", () => {
      const registry = new ChaosRegistry();
      registry.createRule("/orders").always().status(500);
      expect(registry.findBestMatch("/inventory/orders")).toBeUndefined();
    });

    it("prefers the longest matching prefix", () => {
      const registry = new ChaosRegistry();
      const global = registry.createRule("").always().status(500);
      const orders = registry.createRule("/orders").always().status(429);
      const result = registry.findBestMatch("/orders/123");
      expect(result).toBe(orders);
      expect(result).not.toBe(global);
    });

    it("prefers the most recently updated rule among equal-length prefixes", () => {
      const registry = new ChaosRegistry();
      registry.createRule("/orders").always().status(500);
      const second = registry.createRule("/orders").always().status(429);
      // second was created (and therefore touched) after first
      expect(registry.findBestMatch("/orders/123")).toBe(second);
    });

    it("skips stopped rules", () => {
      const registry = new ChaosRegistry();
      const rule = registry.createRule("/orders").always().status(500);
      rule.stop();
      expect(registry.findBestMatch("/orders/123")).toBeUndefined();
    });

    it("skips exhausted rules", () => {
      const registry = new ChaosRegistry();
      const rule = registry.createRule("/orders").next(1).status(500);
      rule.tryApply({ body: "ok", status: 200 }); // exhaust
      expect(registry.findBestMatch("/orders/123")).toBeUndefined();
    });

    it("a stopped rule becomes the most recently updated after start()", () => {
      const registry = new ChaosRegistry();
      const first = registry.createRule("/orders").always().status(500);
      registry.createRule("/orders").always().status(429);
      first.stop();
      first.start(); // first is now the most recently updated
      expect(registry.findBestMatch("/orders/123")).toBe(first);
    });
  });
});

// ---------------------------------------------------------------------------
// Integration tests via Dispatcher
// ---------------------------------------------------------------------------

describe("Dispatcher with ChaosRegistry", () => {
  it("applies a global rule to all paths", async () => {
    const cr = new ChaosRegistry();
    cr.createRule("").always().status(503);
    const dispatcher = makeDispatcher(cr);
    const response = await get(dispatcher, "/orders");
    expect(response.status).toBe(503);
  });

  it("applies a prefix-scoped rule only to matching paths", async () => {
    const cr = new ChaosRegistry();
    cr.createRule("/orders").always().status(429);
    const dispatcher = makeDispatcher(cr);

    const ordersResponse = await get(dispatcher, "/orders");
    expect(ordersResponse.status).toBe(429);

    const usersResponse = await get(dispatcher, "/users");
    expect(usersResponse.status).toBe(200);
  });

  it("applies next() exactly once", async () => {
    const cr = new ChaosRegistry();
    cr.createRule("/orders").next().status(500);
    const dispatcher = makeDispatcher(cr);

    const first = await get(dispatcher, "/orders");
    expect(first.status).toBe(500);

    const second = await get(dispatcher, "/orders");
    expect(second.status).toBe(200);
  });

  it("applies next(count) the expected number of times", async () => {
    const cr = new ChaosRegistry();
    cr.createRule("/orders").next(2).status(500);
    const dispatcher = makeDispatcher(cr);

    expect((await get(dispatcher, "/orders")).status).toBe(500);
    expect((await get(dispatcher, "/orders")).status).toBe(500);
    expect((await get(dispatcher, "/orders")).status).toBe(200);
  });

  it("always() continues to apply", async () => {
    const cr = new ChaosRegistry();
    cr.createRule("/orders").always().status(503);
    const dispatcher = makeDispatcher(cr);

    for (let i = 0; i < 5; i++) {
      expect((await get(dispatcher, "/orders")).status).toBe(503);
    }
  });

  it("probability(0) never applies", async () => {
    const cr = new ChaosRegistry();
    cr.createRule("/orders").always().probability(0).status(500);
    const dispatcher = makeDispatcher(cr);

    for (let i = 0; i < 10; i++) {
      expect((await get(dispatcher, "/orders")).status).toBe(200);
    }
  });

  it("probability(1) always applies", async () => {
    const cr = new ChaosRegistry();
    cr.createRule("/orders").always().probability(1).status(500);
    const dispatcher = makeDispatcher(cr);

    for (let i = 0; i < 5; i++) {
      expect((await get(dispatcher, "/orders")).status).toBe(500);
    }
  });

  it("status() overrides the response status code", async () => {
    const cr = new ChaosRegistry();
    cr.createRule("/orders").always().status(429);
    const dispatcher = makeDispatcher(cr);
    const response = await get(dispatcher, "/orders");
    expect(response.status).toBe(429);
  });

  it("header() adds or replaces a response header", async () => {
    const cr = new ChaosRegistry();
    cr.createRule("/orders").always().header("Retry-After", "60");
    const dispatcher = makeDispatcher(cr);
    const response = await get(dispatcher, "/orders");
    expect(response.headers?.["Retry-After"]).toBe("60");
  });

  it("removeHeader() removes a response header", async () => {
    const cr = new ChaosRegistry();
    cr.createRule("/orders").always().removeHeader("x-original");
    const dispatcher = makeDispatcher(cr);
    const response = await get(dispatcher, "/orders");
    expect(response.headers?.["x-original"]).toBeUndefined();
  });

  it("header()/removeHeader() do not modify response Content-Type", async () => {
    const cr = new ChaosRegistry();
    cr.createRule("/orders")
      .always()
      .header("content-type", "text/plain")
      .removeHeader("content-type");
    const dispatcher = makeDispatcher(cr);
    const response = await get(dispatcher, "/orders");
    expect(response.contentType).toBe("application/json");
  });

  it("body() replaces the response body", async () => {
    const cr = new ChaosRegistry();
    cr.createRule("/orders").always().body("chaos body");
    const dispatcher = makeDispatcher(cr);
    const response = await get(dispatcher, "/orders");
    expect(response.body).toBe("chaos body");
  });

  it("transformBody() transforms the existing body", async () => {
    const cr = new ChaosRegistry();
    cr.createRule("/orders")
      .always()
      .transformBody((b) => `${b}-modified`);
    const dispatcher = makeDispatcher(cr);
    const response = await get(dispatcher, "/orders");
    expect(response.body).toContain("-modified");
  });

  it("stop() disables a rule", async () => {
    const cr = new ChaosRegistry();
    const rule = cr.createRule("/orders").always().status(500);
    rule.stop();
    const dispatcher = makeDispatcher(cr);
    const response = await get(dispatcher, "/orders");
    expect(response.status).toBe(200);
  });

  it("start() re-enables a stopped rule", async () => {
    const cr = new ChaosRegistry();
    const rule = cr.createRule("/orders").always().status(500);
    rule.stop();
    rule.start();
    const dispatcher = makeDispatcher(cr);
    const response = await get(dispatcher, "/orders");
    expect(response.status).toBe(500);
  });

  it("stopped rules do not decrement their remaining count", async () => {
    const cr = new ChaosRegistry();
    const rule = cr.createRule("/orders").next(2).status(500);
    const dispatcher = makeDispatcher(cr);

    rule.stop();
    await get(dispatcher, "/orders"); // should not decrement
    await get(dispatcher, "/orders"); // should not decrement

    rule.start();
    expect((await get(dispatcher, "/orders")).status).toBe(500);
    expect((await get(dispatcher, "/orders")).status).toBe(500);
    expect((await get(dispatcher, "/orders")).status).toBe(200);
  });

  it("probability-skipped responses do not decrement the remaining count", async () => {
    const cr = new ChaosRegistry();
    const rule = cr.createRule("/orders").next(2).probability(0).status(500);
    const dispatcher = makeDispatcher(cr);

    // All skipped due to probability(0)
    for (let i = 0; i < 5; i++) {
      expect((await get(dispatcher, "/orders")).status).toBe(200);
    }

    // Switch to always-fire
    rule.probability(1);
    expect((await get(dispatcher, "/orders")).status).toBe(500);
    expect((await get(dispatcher, "/orders")).status).toBe(500);
    expect((await get(dispatcher, "/orders")).status).toBe(200);
  });

  it("delay() delays the response", async () => {
    const delays: number[] = [];
    const originalSetTimeout = global.setTimeout;

    // Spy on setTimeout to record delays without actually waiting
    jest
      .spyOn(global, "setTimeout")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- spy needs any for args
      .mockImplementation((fn: any, ms?: number) => {
        // eslint-disable-next-line jest/no-conditional-in-test -- ms ?? 0 is a default, not a test branch
        delays.push(ms ?? 0);
        return originalSetTimeout(fn, 0); // fire immediately
      });

    const cr = new ChaosRegistry();
    cr.createRule("/orders").always().delay(2_000);
    const dispatcher = makeDispatcher(cr);

    const response = await get(dispatcher, "/orders");
    expect(response.status).toBe(200);
    expect(delays).toContain(2_000);

    jest.restoreAllMocks();
  });
});
