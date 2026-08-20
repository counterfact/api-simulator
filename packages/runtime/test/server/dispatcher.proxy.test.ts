import { Headers } from "node-fetch";

import { ContextRegistry } from "../../src/server/context-registry.js";
import { Dispatcher } from "../../src/server/dispatcher.js";
import { Registry } from "../../src/server/registry.js";

describe("a dispatcher passes a proxy function to the operation", () => {
  it("passes a proxy function", async () => {
    const registry = new Registry();

    registry.add("/a", {
      async GET({ proxy }) {
        return await proxy("https://example.com");
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());

    dispatcher.fetch = async (url) =>
      /* @ts-expect-error not mocking all properties of fetch response */
      await Promise.resolve({
        headers: new Headers([["content-type", "application/json"]]),
        status: 200,

        async text() {
          return await Promise.resolve(`body from ${url}`);
        },
      });

    /* @ts-expect-error not including all properties of request */
    const response = await dispatcher.request({
      method: "GET",
      path: "/a",

      req: {
        path: "/a?x=1",
      },
    });

    const { body, contentType, headers, status } = response;

    expect(body).toBe("body from https://example.com/a?x=1");
    expect(headers).toStrictEqual({
      "content-type": "application/json",
    });
    expect(contentType).toBe("application/json");
    expect(status).toBe(200);
  });

  it("forwards the raw body to the upstream when proxying a POST with a JSON body", async () => {
    const registry = new Registry();

    registry.add("/a", {
      async POST({ proxy }) {
        return await proxy("https://example.com");
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());

    let capturedBody: string | undefined;

    dispatcher.fetch = async (_url, options) => {
      capturedBody = options?.body as string | undefined;

      /* @ts-expect-error not mocking all properties of fetch response */
      return Promise.resolve({
        headers: new Headers([["content-type", "application/json"]]),
        status: 200,

        async text() {
          return Promise.resolve("{}");
        },
      });
    };

    /* @ts-expect-error not including all properties of request */
    await dispatcher.request({
      body: { foo: "bar" },
      headers: { "content-type": "application/json" },
      method: "POST",
      path: "/a",
      rawBody: '{"foo":"bar"}',

      req: { path: "/a" },
    });

    expect(capturedBody).toBe('{"foo":"bar"}');
  });

  it("forwards the raw body to the upstream when proxying a POST with a text/plain body", async () => {
    const registry = new Registry();

    registry.add("/a", {
      async POST({ proxy }) {
        return await proxy("https://example.com");
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());

    let capturedBody: string | undefined;

    dispatcher.fetch = async (_url, options) => {
      capturedBody = options?.body as string | undefined;

      /* @ts-expect-error not mocking all properties of fetch response */
      return Promise.resolve({
        headers: new Headers([["content-type", "text/plain"]]),
        status: 200,

        async text() {
          return Promise.resolve("hello");
        },
      });
    };

    /* @ts-expect-error not including all properties of request */
    await dispatcher.request({
      body: "plain text body",
      headers: { "content-type": "text/plain" },
      method: "POST",
      path: "/a",
      rawBody: "plain text body",

      req: { path: "/a" },
    });

    expect(capturedBody).toBe("plain text body");
  });

  it("forwards the raw body unchanged even when content-type has a charset suffix", async () => {
    const registry = new Registry();

    registry.add("/a", {
      async POST({ proxy }) {
        return await proxy("https://example.com");
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());

    let capturedBody: string | undefined;

    dispatcher.fetch = async (_url, options) => {
      capturedBody = options?.body as string | undefined;

      /* @ts-expect-error not mocking all properties of fetch response */
      return Promise.resolve({
        headers: new Headers([
          ["content-type", "application/json; charset=utf-8"],
        ]),
        status: 200,

        async text() {
          return Promise.resolve("{}");
        },
      });
    };

    /* @ts-expect-error not including all properties of request */
    await dispatcher.request({
      body: { foo: "bar" },
      headers: { "content-type": "application/json; charset=utf-8" },
      method: "POST",
      path: "/a",
      rawBody: '{"foo":"bar"}',

      req: { path: "/a" },
    });

    expect(capturedBody).toBe('{"foo":"bar"}');
  });
});
