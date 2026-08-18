import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { ChaosRegistry, ChaosRule } from "../../src/server/chaos.js";
import { ContextRegistry } from "../../src/server/context-registry.js";
import { Dispatcher } from "../../src/server/dispatcher.js";
import { Registry } from "../../src/server/registry.js";

function makeDispatcher(chaosRegistry: ChaosRegistry): Dispatcher {
  const registry = new Registry();

  registry.add("/orders", {
    GET() {
      return {
        body: "orders",
        contentType: "text/plain",
        headers: { "X-Original": "yes" },
        status: 200,
      };
    },
  });
  registry.add("/users", {
    GET() {
      return { body: "users", contentType: "text/plain", status: 200 };
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

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("ChaosRule", () => {
  it("applies indefinitely by default and preserves untouched fields", () => {
    const rule = new ChaosRule("").status(503);
    const response = {
      body: "ok",
      contentType: "text/plain",
      headers: { keep: "yes" },
      status: 200,
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(rule.tryApply(response)?.response).toEqual({
        ...response,
        status: 503,
      });
    }
  });

  it("applies only to the configured next count", () => {
    const rule = new ChaosRule("").next(2).status(500);
    const response = { body: "ok", status: 200 };

    expect(rule.tryApply(response)?.response.status).toBe(500);
    expect(rule.tryApply(response)?.response.status).toBe(500);
    expect(rule.tryApply(response)).toBeNull();
  });

  it("does not consume its count when stopped or skipped by probability", () => {
    const rule = new ChaosRule("").next(2).probability(0).status(500);
    const response = { body: "ok", status: 200 };

    expect(rule.tryApply(response)).toBeNull();
    rule.stop().probability(1);
    expect(rule.tryApply(response)).toBeNull();
    rule.start();
    expect(rule.tryApply(response)).not.toBeNull();
    expect(rule.tryApply(response)).not.toBeNull();
    expect(rule.tryApply(response)).toBeNull();
  });

  it("never fires at probability zero, even when Math.random returns zero", () => {
    jest.spyOn(Math, "random").mockReturnValue(0);

    expect(
      new ChaosRule("").probability(0).tryApply({ body: "ok", status: 200 }),
    ).toBeNull();
  });

  it.each([-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid probability of %s",
    (probability) => {
      expect(() => new ChaosRule("").probability(probability)).toThrow(
        RangeError,
      );
    },
  );

  it("lets the last body mutation win", () => {
    const rule = new ChaosRule("")
      .transformBody((body) => `${String(body)} transformed`)
      .body("replacement")
      .transformBody((body) => `${String(body)} final`);

    expect(
      rule.tryApply({ body: "original", status: 200 })?.response.body,
    ).toBe("original final");
  });

  it("applies header mutations case-insensitively with the last call winning", () => {
    const response = {
      body: "ok",
      headers: { "X-First": "original", "X-Second": "original" },
      status: 200,
    };
    const result = new ChaosRule("")
      .header("x-first", "changed")
      .removeHeader("X-FIRST")
      .removeHeader("x-second")
      .header("X-SECOND", "changed")
      .tryApply(response);

    expect(result?.response.headers).toEqual({ "X-SECOND": "changed" });
  });

  it("protects Content-Type under every casing", () => {
    const response = {
      body: "ok",
      contentType: "application/json",
      headers: { "Content-Type": "application/json" },
      status: 200,
    };
    const result = new ChaosRule("")
      .header("CONTENT-TYPE", "text/plain")
      .removeHeader("content-type")
      .tryApply(response);

    expect(result?.response).toMatchObject(response);
  });
});

describe("ChaosRegistry", () => {
  it("selects the longest matching prefix", () => {
    const registry = new ChaosRegistry();
    registry.createRule("").status(500);
    const orders = registry.createRule("/orders").status(429);

    expect(registry.findBestMatch("/orders/1")).toBe(orders);
    expect(registry.findBestMatch("/inventory/orders")).not.toBe(orders);
  });

  it("selects the most recently updated equal-prefix rule", () => {
    const registry = new ChaosRegistry();
    const first = registry.createRule("/orders").status(500);
    registry.createRule("/orders").status(429);

    first.stop().start();

    expect(registry.findBestMatch("/orders/1")).toBe(first);
  });

  it("skips stopped and exhausted rules", () => {
    const registry = new ChaosRegistry();
    registry.createRule("/orders").stop();
    const exhausted = registry.createRule("/orders").next();
    exhausted.tryApply({ body: "ok", status: 200 });

    expect(registry.findBestMatch("/orders")).toBeUndefined();
  });
});

describe("Dispatcher chaos integration", () => {
  it("applies a shared global rule across routes", async () => {
    const registry = new ChaosRegistry();
    registry.createRule().status(503);
    const dispatcher = makeDispatcher(registry);

    expect((await get(dispatcher, "/orders")).status).toBe(503);
    expect((await get(dispatcher, "/users")).status).toBe(503);
  });

  it("applies a scoped rule only to matching routes", async () => {
    const registry = new ChaosRegistry();
    registry.createRule("/orders").status(429);
    const dispatcher = makeDispatcher(registry);

    expect((await get(dispatcher, "/orders")).status).toBe(429);
    expect((await get(dispatcher, "/users")).status).toBe(200);
  });

  it("delays a response and always restores fake timers", async () => {
    jest.useFakeTimers();
    const registry = new ChaosRegistry();
    registry.createRule("/orders").delay(2_000);
    const responsePromise = get(makeDispatcher(registry), "/orders");

    await jest.runAllTimersAsync();

    await expect(responsePromise).resolves.toMatchObject({ status: 200 });
  });
});
