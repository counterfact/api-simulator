import { jest } from "@jest/globals";
import Koa from "koa";
import request from "supertest";

import { createKoaApp } from "../../src/koa.js";
import { ContextRegistry } from "../../src/server/context-registry.js";
import { Dispatcher } from "../../src/server/dispatcher.js";
import { Registry } from "../../src/server/registry.js";

describe("createKoaApp", () => {
  it("serves a runtime runner below its configured prefix", async () => {
    const contextRegistry = new ContextRegistry();
    const registry = new Registry();
    registry.add("/health", {
      GET() {
        return {
          body: JSON.stringify({ method: "GET", path: "/health" }),
          contentType: "application/json",
          status: 200,
        };
      },
    });

    const app = createKoaApp({
      runners: [
        {
          contextRegistry,
          dispatcher: new Dispatcher(registry, contextRegistry),
          openApiPath: "unused.yaml",
          overlays: [],
          prefix: "/v1",
          registry,
          subdirectory: "",
        },
      ],
      config: {
        basePath: ".",
        port: 0,
        proxyPaths: new Map(),
        proxyUrl: "",
        startAdminApi: false,
      },
    });

    const response = await request(app.callback()).get("/v1/health");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.body).toEqual({ method: "GET", path: "/health" });
  });

  it("reports only the first served API request without its path", async () => {
    const contextRegistry = new ContextRegistry();
    const registry = new Registry();
    const reportEvent = jest.fn();
    registry.add("/health", {
      GET: () => ({ body: "ok", status: 200 }),
    });

    const app = createKoaApp({
      runners: [
        {
          contextRegistry,
          dispatcher: new Dispatcher(registry, contextRegistry),
          openApiPath: "unused.yaml",
          overlays: [],
          prefix: "",
          registry,
          subdirectory: "",
        },
      ],
      config: {
        basePath: ".",
        port: 0,
        proxyPaths: new Map(),
        proxyUrl: "",
        startAdminApi: false,
      },
      reportEvent,
    });

    await request(app.callback()).get("/health");
    await request(app.callback()).get("/health?private=value");

    expect(reportEvent).toHaveBeenCalledTimes(1);
    expect(reportEvent).toHaveBeenCalledWith("first_api_request_served", {
      statusClass: "2xx",
    });
    expect(JSON.stringify(reportEvent.mock.calls)).not.toContain("health");
    expect(JSON.stringify(reportEvent.mock.calls)).not.toContain("private");
  });
});

describe("JSON prettification middleware", () => {
  function buildApp(responseBody: unknown) {
    const app = new Koa();

    // The upstream middleware that produces a response
    app.use(async (ctx, next) => {
      await next();

      if (
        ctx.body !== null &&
        ctx.body !== undefined &&
        typeof ctx.body === "object" &&
        !Buffer.isBuffer(ctx.body)
      ) {
        ctx.body = JSON.stringify(ctx.body, null, 2);
        ctx.type = "application/json";
      }
    });

    // Downstream middleware sets the body
    app.use(async (ctx) => {
      ctx.body = responseBody;
    });

    return app;
  }

  it("prettifies an object response body with 2-space indentation", async () => {
    const responseObject = { greeting: "Hello", name: "World" };
    const app = buildApp(responseObject);

    const response = await request(app.callback()).get("/");

    expect(response.status).toBe(200);
    expect(response.text).toBe(JSON.stringify(responseObject, null, 2));
    expect(response.type).toBe("application/json");
  });

  it("does not modify a string response body", async () => {
    const app = buildApp("plain string response");

    const response = await request(app.callback()).get("/");

    expect(response.status).toBe(200);
    expect(response.text).toBe("plain string response");
  });

  it("does not modify a Buffer response body", async () => {
    const bufferBody = Buffer.from("binary data");
    const app = buildApp(bufferBody);

    const response = await request(app.callback()).get("/");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(Buffer.from("binary data"));
  });

  it("does not modify a null response body", async () => {
    const app = buildApp(null);

    const response = await request(app.callback()).get("/");

    expect(response.status).toBe(204);
  });
});
