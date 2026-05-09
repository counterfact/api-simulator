import { jest } from "@jest/globals";
import type { ParameterizedContext } from "koa";
import type { IBaseKoaProxiesOptions } from "koa-proxies";

import type { Config } from "../../../src/server/config.js";
import { ContextRegistry } from "../../../src/server/context-registry.js";
import { Dispatcher } from "../../../src/server/dispatcher.js";
import { routesMiddleware } from "../../../src/server/web-server/routes-middleware.js";
import { Registry } from "../../../src/server/registry.js";

const CONFIG: Config = {
  basePath: "",

  generate: {
    routes: true,
    types: true,
  },

  openApiPath: "",
  port: 9999,
  proxyPaths: new Map([]),
  proxyUrl: "",
  prefix: "",
  startAdminApi: false,
  startRepl: false,
  startServer: true,

  watch: {
    routes: true,
    types: true,
  },
  alwaysFakeOptionals: false,
  buildCache: false,
  validateRequests: true,
  validateResponses: true,
};

const mockKoaProxy = (path: string, { target }: IBaseKoaProxiesOptions) =>
  function proxy(context: { mockProxyTarget: string }) {
    context.mockProxyTarget = target;
  };

function fallbackAuth(value: string | undefined): string {
  return value ?? "";
}

describe("koa middleware", () => {
  it("passes the request to the dispatcher and returns the response", async () => {
    const registry = new Registry();

    registry.add("/hello", {
      // @ts-expect-error - not obvious how to make TS happy here, and it's just a unit test
      POST({ body }: { body: { name: string } }) {
        return {
          body: `Hello, ${body.name}!`,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const middleware = routesMiddleware(CONFIG.prefix, dispatcher, CONFIG);

    const ctx = {
      req: {
        path: "/hello",
      },

      request: {
        body: { name: "Homer" },
        headers: {},
        method: "POST",
        path: "/hello",
      },

      set: jest.fn(),
    } as unknown as ParameterizedContext;

    await middleware(ctx, async () => {
      await Promise.resolve(undefined);
    });

    expect(ctx.status).toBe(200);
    expect(ctx.body).toBe("Hello, Homer!");
  });

  it("passes the request body to a QUERY handler", async () => {
    const registry = new Registry();

    registry.add("/search", {
      // @ts-expect-error - not obvious how to make TS happy here, and it's just a unit test
      QUERY({ body }: { body: { filter: string } }) {
        return {
          body: `results for: ${body.filter}`,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const middleware = routesMiddleware(CONFIG.prefix, dispatcher, CONFIG);

    const ctx = {
      req: {
        path: "/search",
      },

      request: {
        body: { filter: "cats" },
        headers: {},
        method: "QUERY",
        path: "/search",
      },

      set: jest.fn(),
    } as unknown as ParameterizedContext;

    await middleware(ctx, async () => {
      await Promise.resolve(undefined);
    });

    expect(ctx.status).toBe(200);
    expect(ctx.body).toBe("results for: cats");
  });

  it("passes the status code", async () => {
    const registry = new Registry();

    registry.add("/not-modified", {
      GET() {
        return {
          status: 304,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const middleware = routesMiddleware(CONFIG.prefix, dispatcher, CONFIG);
    const ctx = {
      request: { headers: {}, method: "GET", path: "/not-modified" },

      set: () => undefined,
      status: undefined,
    };

    // @ts-expect-error - not obvious how to make TS happy here, and it's just a unit test
    await middleware(ctx, async () => {
      await Promise.resolve(undefined);
    });

    expect(ctx.status).toBe(304);
  });

  it("proxies when a proxyURL is passed in the options", async () => {
    const registry = new Registry();

    registry.add("/proxy", {
      GET() {
        throw new Error("should not be called because the proxy is used");
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const middleware = routesMiddleware(
      CONFIG.prefix,
      dispatcher,
      {
        ...CONFIG,
        proxyPaths: new Map([["", true]]),
        proxyUrl: "https://example.com",
      },

      // @ts-expect-error - not worried about matching the type exactly for a mock
      mockKoaProxy,
    );
    const ctx = {
      mockProxyTarget: "not-set",
      request: { headers: {}, method: "GET", path: "/proxy" },

      set() {
        /* set a header */
      },
    };

    // @ts-expect-error - not obvious how to make TS happy here, and it's just a unit test
    await middleware(ctx, async () => {
      await Promise.resolve(undefined);
    });

    expect(ctx.mockProxyTarget).toBe("https://example.com");
  });

  it("adds default CORS headers if none are requested", async () => {
    const registry = new Registry();

    registry.add("/hello", {
      POST({ body }) {
        return {
          body: `Hello, ${(body as { name: string }).name}!`,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const middleware = routesMiddleware(CONFIG.prefix, dispatcher, CONFIG);
    const ctx = {
      body: undefined,

      req: {
        path: "/hello",
      },

      request: {
        body: { name: "Homer" },
        headers: {},
        method: "POST",
        path: "/hello",
      },

      set: jest.fn(),

      status: undefined,
    };

    // @ts-expect-error - not obvious how to make TS happy here, and it's just a unit test
    await middleware(ctx, async () => {
      await Promise.resolve(undefined);
    });

    expect(ctx.status).toBe(200);
    expect(ctx.body).toBe("Hello, Homer!");
    expect(ctx.set).toHaveBeenCalledWith("Access-Control-Allow-Origin", "*");
    expect(ctx.set).toHaveBeenCalledWith(
      "Access-Control-Allow-Methods",
      "POST",
    );
    expect(ctx.set).toHaveBeenCalledWith("Access-Control-Allow-Headers", []);
    expect(ctx.set).toHaveBeenCalledWith("Access-Control-Expose-Headers", []);
  });

  it("reflects desired CORS headers if specific headers are requested", async () => {
    const registry = new Registry();

    registry.add("/hello", {
      POST({ body }) {
        return {
          body: `Hello, ${(body as { name: string }).name}!`,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const middleware = routesMiddleware(CONFIG.prefix, dispatcher, CONFIG);
    const ctx = {
      body: undefined,

      req: {
        path: "/hello",
      },

      request: {
        body: { name: "Homer" },

        headers: {
          "access-control-request-headers": "X-My-Header,X-Another-Header",
          origin: "https://my.local.app:3000",
        },

        method: "POST",

        path: "/hello",
      },

      set: jest.fn(),
      status: undefined,
    };

    // @ts-expect-error - not obvious how to make TS happy here, and it's just a unit test
    await middleware(ctx);

    expect(ctx.status).toBe(200);
    expect(ctx.body).toBe("Hello, Homer!");
    expect(ctx.set).toHaveBeenCalledWith(
      "Access-Control-Allow-Origin",
      "https://my.local.app:3000",
    );
    expect(ctx.set).toHaveBeenCalledWith(
      "Access-Control-Allow-Methods",
      "POST",
    );
    expect(ctx.set).toHaveBeenCalledWith(
      "Access-Control-Allow-Headers",
      "X-My-Header,X-Another-Header",
    );
    expect(ctx.set).toHaveBeenCalledWith(
      "Access-Control-Expose-Headers",
      "X-My-Header,X-Another-Header",
    );
  });

  it("adds custom response builder headers", async () => {
    const registry = new Registry();

    registry.add("/hello", {
      POST({ body }) {
        return {
          body: `Hello, ${(body as { name: string }).name}!`,

          headers: {
            "X-Custom-Header": "custom value",
          },
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const middleware = routesMiddleware(CONFIG.prefix, dispatcher, CONFIG);
    const ctx = {
      body: undefined,

      req: {
        path: "/hello",
      },

      request: {
        body: { name: "Homer" },
        headers: {},
        method: "POST",
        path: "/hello",
      },

      set: jest.fn(),

      status: undefined,
    };

    // @ts-expect-error - not obvious how to make TS happy here, and it's just a unit test
    await middleware(ctx, async () => {
      await Promise.resolve(undefined);
    });

    expect(ctx.status).toBe(200);
    expect(ctx.body).toBe("Hello, Homer!");

    expect(ctx.set).toHaveBeenCalledWith("X-Custom-Header", "custom value");
  });

  it("strips prefix from the request path before dispatching", async () => {
    const registry = new Registry();

    registry.add("/hello", {
      // @ts-expect-error - not obvious how to make TS happy here, and it's just a unit test
      POST({ body }: { body: { name: string } }) {
        return {
          body: `Hello, ${body.name}!`,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const middleware = routesMiddleware("/api/v1", dispatcher, CONFIG);

    const ctx = {
      req: {
        path: "/api/v1/hello",
      },

      request: {
        body: { name: "Homer" },
        headers: {},
        method: "POST",
        path: "/api/v1/hello",
      },

      set: jest.fn(),
    } as unknown as ParameterizedContext;

    await middleware(ctx, async () => {
      await Promise.resolve(undefined);
    });

    expect(ctx.status).toBe(200);
    expect(ctx.body).toBe("Hello, Homer!");
  });

  it("does not pass a request body for a GET request", async () => {
    const registry = new Registry();

    registry.add("/hello", {
      GET(requestData) {
        return {
          body: `Hello, ${requestData?.body?.name}!`,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const middleware = routesMiddleware("/api/v1", dispatcher, CONFIG);

    const ctx = {
      req: {
        path: "/api/v1/hello",
      },

      request: {
        body: { name: "Homer" },
        headers: {},
        method: "GET",
        path: "/api/v1/hello",
      },

      set: jest.fn(),
    } as unknown as ParameterizedContext;

    await middleware(ctx, async () => {
      await Promise.resolve(undefined);
    });

    expect(ctx.status).toBe(200);
    expect(ctx.body).toBe("Hello, undefined!");
  });

  it("collects basic authorization headers", async () => {
    const registry = new Registry();

    registry.add("/hello", {
      GET({ auth }: { auth?: { password?: string; username?: string } }) {
        const username = fallbackAuth(auth?.username);
        const password = fallbackAuth(auth?.password);

        return {
          body: `${username} / ${password}`,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const middleware = routesMiddleware(CONFIG.prefix, dispatcher, CONFIG);

    const ctx = {
      req: {
        path: "/hello",
      },

      request: {
        body: { name: "Homer" },

        headers: {
          authorization: `Basic ${btoa("user:secret")}`,
        },

        method: "GET",
        path: "/hello",
      },

      set: jest.fn(),
    } as unknown as ParameterizedContext;

    await middleware(ctx, async () => {
      await Promise.resolve(undefined);
    });

    expect(ctx.body).toEqual("user / secret");
  });

  it("sets ctx.type from response contentType for binary responses", async () => {
    const registry = new Registry();
    const binaryData = Buffer.from("binary content");

    registry.add("/file", {
      GET() {
        return {
          body: binaryData,
          contentType: "application/octet-stream",
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const middleware = routesMiddleware(CONFIG.prefix, dispatcher, CONFIG);

    const ctx = {
      body: undefined,
      req: { path: "/file" },

      request: {
        headers: { accept: "application/octet-stream" },
        method: "GET",
        path: "/file",
      },

      set: jest.fn(),
      type: undefined as string | undefined,
    };

    // @ts-expect-error - not obvious how to make TS happy here, and it's just a unit test
    await middleware(ctx, async () => {
      await Promise.resolve(undefined);
    });

    expect(ctx.body).toStrictEqual(binaryData);
    expect(ctx.type).toBe("application/octet-stream");
  });
});
