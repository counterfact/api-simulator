import Koa from "koa";
import request from "supertest";
import yaml from "js-yaml";

import { usingTemporaryFiles } from "using-temporary-files";

import { openapiMiddleware } from "../../../src/server/web-server/openapi-middleware.js";

describe("openapiMiddleware", () => {
  it("serves the OpenAPI document at the given path prefix", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.yaml",
        "openapi: '3.0.0'\ninfo:\n  title: Test\n  version: '1.0.0'\npaths: {}\n",
      );

      const app = new Koa();

      app.use(
        openapiMiddleware("/counterfact/openapi", {
          path: $.path("openapi.yaml"),
          baseUrl: "//localhost:3100",
        }),
      );

      const response = await request(app.callback()).get(
        "/counterfact/openapi",
      );

      expect(response.status).toBe(200);
      const doc = yaml.load(response.text) as { info: { title: string } };

      expect(doc.info.title).toBe("Test");
    });
  });

  it("injects a Counterfact server entry", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.yaml",
        "openapi: '3.0.0'\ninfo:\n  title: Test\n  version: '1.0.0'\npaths: {}\n",
      );

      const app = new Koa();

      app.use(
        openapiMiddleware("/counterfact/openapi", {
          path: $.path("openapi.yaml"),
          baseUrl: "//localhost:3100",
        }),
      );

      const response = await request(app.callback()).get(
        "/counterfact/openapi",
      );

      const doc = yaml.load(response.text) as {
        servers: { name: string; description: string; url: string }[];
      };

      expect(doc.servers[0]).toStrictEqual({
        name: "Counterfact",
        description: "Counterfact",
        url: "//localhost:3100",
      });
    });
  });

  it("resolves external $ref references in the OpenAPI document", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.yaml",
        [
          "openapi: '3.0.0'",
          "info:",
          "  title: Test",
          "  version: '1.0.0'",
          "paths:",
          "  /metrics:",
          "    get:",
          "      responses:",
          "        '200':",
          "          description: Successful response",
          "          content:",
          "            application/json:",
          "              schema:",
          "                $ref: 'components/metrics.yaml#/components/schemas/MetricsResponse'",
        ].join("\n"),
      );
      await $.add(
        "components/metrics.yaml",
        [
          "components:",
          "  schemas:",
          "    MetricsResponse:",
          "      type: object",
          "      properties:",
          "        data:",
          "          type: array",
          "          items:",
          "            type: string",
        ].join("\n"),
      );

      const app = new Koa();

      app.use(
        openapiMiddleware("/counterfact/openapi", {
          path: $.path("openapi.yaml"),
          baseUrl: "//localhost:3100",
        }),
      );

      const response = await request(app.callback()).get(
        "/counterfact/openapi",
      );

      expect(response.status).toBe(200);

      const doc = yaml.load(response.text) as {
        paths: {
          "/metrics": {
            get: {
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref?: string;
                        type?: string;
                        properties?: object;
                      };
                    };
                  };
                };
              };
            };
          };
        };
      };

      const schema =
        doc.paths["/metrics"].get.responses["200"].content["application/json"]
          .schema;

      // bundle() inlines external $refs - no external file reference should remain
      expect(schema.$ref).toBeUndefined();
      // The schema should be fully resolved with its type
      expect(schema.type).toBe("object");
    });
  });

  it("preserves $self and resolves relative $refs in a spec with $self", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.yaml",
        [
          "openapi: '3.2.0'",
          "$self: 'https://example.com/openapi.yaml'",
          "info:",
          "  title: Test With Self",
          "  version: '1.0.0'",
          "paths:",
          "  /pets:",
          "    get:",
          "      responses:",
          "        '200':",
          "          description: OK",
          "          content:",
          "            application/json:",
          "              schema:",
          "                $ref: 'components/pet.yaml#/schemas/Pet'",
        ].join("\n"),
      );
      await $.add(
        "components/pet.yaml",
        [
          "schemas:",
          "  Pet:",
          "    type: object",
          "    properties:",
          "      name:",
          "        type: string",
        ].join("\n"),
      );

      const app = new Koa();

      app.use(
        openapiMiddleware("/counterfact/openapi", {
          path: $.path("openapi.yaml"),
          baseUrl: "//localhost:3100",
        }),
      );

      const response = await request(app.callback()).get(
        "/counterfact/openapi",
      );

      expect(response.status).toBe(200);

      const doc = yaml.load(response.text) as {
        $self?: string;
        paths: {
          "/pets": {
            get: {
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref?: string;
                        type?: string;
                        properties?: object;
                      };
                    };
                  };
                };
              };
            };
          };
        };
      };

      // $self should be preserved verbatim in the bundled document
      expect(doc["$self"]).toBe("https://example.com/openapi.yaml");

      const schema =
        doc.paths["/pets"].get.responses["200"].content["application/json"]
          .schema;

      // bundle() inlines external $refs - no external file reference should remain
      expect(schema.$ref).toBeUndefined();
      // The schema should be fully resolved with its type
      expect(schema.type).toBe("object");
    });
  });

  it("applies overlay update actions to the served document", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.yaml",
        "openapi: '3.0.0'\ninfo:\n  title: Original Title\n  version: '1.0.0'\npaths: {}\n",
      );
      await $.add(
        "overlay.yaml",
        [
          "overlay: 1.0.0",
          "info:",
          "  title: Overlay",
          "  version: 1.0.0",
          "actions:",
          "  - target: $.info",
          "    update:",
          "      title: Patched Title",
        ].join("\n"),
      );

      const app = new Koa();

      app.use(
        openapiMiddleware("/counterfact/openapi", {
          path: $.path("openapi.yaml"),
          baseUrl: "//localhost:3100",
          overlays: [$.path("overlay.yaml")],
        }),
      );

      const response = await request(app.callback()).get(
        "/counterfact/openapi",
      );

      expect(response.status).toBe(200);
      const doc = yaml.load(response.text) as { info: { title: string } };

      expect(doc.info.title).toBe("Patched Title");
    });
  });

  it("applies overlay remove actions to the served document", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.yaml",
        [
          "openapi: '3.0.0'",
          "info:",
          "  title: Test",
          "  version: '1.0.0'",
          "paths:",
          "  /keep:",
          "    get:",
          "      responses:",
          "        '200':",
          "          description: OK",
          "  /remove-me:",
          "    get:",
          "      responses:",
          "        '200':",
          "          description: OK",
        ].join("\n"),
      );
      await $.add(
        "overlay.yaml",
        [
          "overlay: 1.0.0",
          "info:",
          "  title: Overlay",
          "  version: 1.0.0",
          "actions:",
          "  - target: \"$.paths['/remove-me']\"",
          "    remove: true",
        ].join("\n"),
      );

      const app = new Koa();

      app.use(
        openapiMiddleware("/counterfact/openapi", {
          path: $.path("openapi.yaml"),
          baseUrl: "//localhost:3100",
          overlays: [$.path("overlay.yaml")],
        }),
      );

      const response = await request(app.callback()).get(
        "/counterfact/openapi",
      );

      expect(response.status).toBe(200);
      const doc = yaml.load(response.text) as {
        paths: Record<string, unknown>;
      };

      expect(Object.keys(doc.paths)).toContain("/keep");
      expect(Object.keys(doc.paths)).not.toContain("/remove-me");
    });
  });

  it("serves the original document without modification when no overlays are specified", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.yaml",
        "openapi: '3.0.0'\ninfo:\n  title: Unchanged\n  version: '1.0.0'\npaths: {}\n",
      );

      const app = new Koa();

      app.use(
        openapiMiddleware("/counterfact/openapi", {
          path: $.path("openapi.yaml"),
          baseUrl: "//localhost:3100",
        }),
      );

      const response = await request(app.callback()).get(
        "/counterfact/openapi",
      );

      expect(response.status).toBe(200);
      const doc = yaml.load(response.text) as { info: { title: string } };

      expect(doc.info.title).toBe("Unchanged");
    });
  });

  it("does not handle requests to other paths", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.yaml",
        "openapi: '3.0.0'\ninfo:\n  title: Test\n  version: '1.0.0'\npaths: {}\n",
      );

      const app = new Koa();

      app.use(
        openapiMiddleware("/counterfact/openapi", {
          path: $.path("openapi.yaml"),
          baseUrl: "//localhost:3100",
        }),
      );

      app.use((ctx) => {
        ctx.body = "fallthrough";
      });

      const response = await request(app.callback()).get("/other-path");

      expect(response.text).toBe("fallthrough");
    });
  });

  it("serves the document at a custom path prefix", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.yaml",
        "openapi: '3.0.0'\ninfo:\n  title: Custom\n  version: '1.0.0'\npaths: {}\n",
      );

      const app = new Koa();

      app.use(
        openapiMiddleware("/api/spec", {
          path: $.path("openapi.yaml"),
          baseUrl: "//localhost:3100",
        }),
      );

      app.use((ctx) => {
        ctx.body = "fallthrough";
      });

      const specResponse = await request(app.callback()).get("/api/spec");
      expect(specResponse.status).toBe(200);
      const doc = yaml.load(specResponse.text) as { info: { title: string } };
      expect(doc.info.title).toBe("Custom");

      const otherResponse = await request(app.callback()).get(
        "/counterfact/openapi",
      );
      expect(otherResponse.text).toBe("fallthrough");
    });
  });
});
