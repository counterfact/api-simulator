import Koa from "koa";
import request from "supertest";
import { load as yamlLoad } from "js-yaml";
import { usingTemporaryFiles } from "using-temporary-files";

import { createKoaApp } from "../../src/koa.js";
import { ContextRegistry } from "../../src/server/context-registry.js";
import { Dispatcher } from "../../src/server/dispatcher.js";
import { Registry } from "../../src/server/registry.js";

describe("createKoaApp", () => {
  it.each([
    { field: "openapi", version: "3.0.4", subdirectory: "/petstore" },
    { field: "openapi", version: "3.2.0", subdirectory: "" },
    { field: "swagger", version: "2.0", subdirectory: "/legacy" },
  ])(
    "serves documentation for $field $version at '$subdirectory'",
    async ({ field, version, subdirectory }) => {
      await usingTemporaryFiles(async ($) => {
        await $.add(
          "openapi.yaml",
          `${field}: "${version}"\ninfo:\n  title: Version compatibility\n  version: "1.0.0"\npaths: {}\n`,
        );
        const contextRegistry = new ContextRegistry();
        const registry = new Registry();
        const app = createKoaApp({
          runners: [
            {
              contextRegistry,
              dispatcher: new Dispatcher(registry, contextRegistry),
              openApiPath: $.path("openapi.yaml"),
              overlays: [],
              prefix: subdirectory,
              registry,
              subdirectory,
            },
          ],
          config: {
            basePath: $.path(""),
            port: 0,
            proxyPaths: new Map(),
            proxyUrl: "",
            startAdminApi: false,
          },
        });
        const page = await request(app.callback()).get(
          `/counterfact/swagger${subdirectory}/`,
        );
        expect(page.status).toBe(200);
        for (const asset of [
          "swagger-ui.min.css",
          "swagger-ui-bundle.js",
          "swagger-ui-standalone-preset.js",
        ]) {
          expect(page.text).toContain(
            `https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.0/${asset}`,
          );
        }
        expect(page.text).toContain(
          `"url":"/counterfact/openapi${subdirectory}"`,
        );
        const response = await request(app.callback()).get(
          `/counterfact/openapi${subdirectory}`,
        );
        expect(response.status).toBe(200);
        expect(yamlLoad(response.text)).toMatchObject({ [field]: version });
      });
    },
  );

  it.each(["/greetings", ""])(
    "serves each version's document and server prefix in group '%s'",
    async (subdirectory) => {
      await usingTemporaryFiles(async ($) => {
        for (const version of ["v1", "v2"]) {
          await $.add(
            `${version}.yaml`,
            `openapi: 3.0.4\ninfo:\n  title: Greetings ${version}\n  version: ${version}\npaths: {}\n`,
          );
        }
        const runners = ["v1", "v2"].map((version) => {
          const contextRegistry = new ContextRegistry();
          const registry = new Registry();
          return {
            contextRegistry,
            dispatcher: new Dispatcher(registry, contextRegistry),
            openApiPath: $.path(`${version}.yaml`),
            overlays: [],
            prefix: `/${version}`,
            registry,
            subdirectory,
            version,
          };
        });
        const app = createKoaApp({
          runners,
          config: {
            basePath: $.path(""),
            port: 3100,
            proxyPaths: new Map(),
            proxyUrl: "",
            startAdminApi: false,
          },
        });
        for (const version of ["v1", "v2"]) {
          const documentUrl = `/counterfact/openapi${subdirectory}?version=${version}`;
          const page = await request(app.callback()).get(
            `/counterfact/swagger${subdirectory}/?version=${version}`,
          );
          expect(page.status).toBe(200);
          expect(page.text).toContain(`"url":"${documentUrl}"`);
          const response = await request(app.callback()).get(documentUrl);
          expect(response.status).toBe(200);
          expect(yamlLoad(response.text)).toMatchObject({
            info: { title: `Greetings ${version}`, version },
            servers: [{ url: `//localhost:3100/${version}` }],
          });
        }
        const defaultDocument = await request(app.callback()).get(
          `/counterfact/openapi${subdirectory}`,
        );
        expect(yamlLoad(defaultDocument.text)).toMatchObject({
          info: { version: "v1" },
        });
        for (const path of ["openapi", "swagger"]) {
          const response = await request(app.callback()).get(
            `/counterfact/${path}${subdirectory}${path === "swagger" ? "/" : ""}?version=missing`,
          );
          expect(response.status).toBe(404);
        }
      });
    },
  );

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
