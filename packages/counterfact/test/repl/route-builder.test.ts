import { describe, expect, it } from "@jest/globals";

import type { OpenApiDocument } from "../../src/server/dispatcher.js";
import {
  RouteBuilder,
  createRouteFunction,
} from "../../src/repl/route-builder.js";

const OPEN_API_DOCUMENT: OpenApiDocument = {
  paths: {
    "/pet/{petId}": {
      get: {
        parameters: [
          {
            in: "path",
            name: "petId",
            required: true,
            type: "integer",
          },
        ],
        responses: {
          "200": { description: "successful operation" },
          "404": { description: "Pet not found" },
        },
      },
    },
    "/pet/findByStatus": {
      get: {
        parameters: [
          {
            enum: ["available", "pending", "sold"],
            in: "query",
            name: "status",
            required: false,
            type: "string",
          },
        ],
        responses: {
          "200": { description: "successful operation" },
        },
      },
    },
  },
};

describe("RouteBuilder", () => {
  describe("fluent builder API", () => {
    it("creates a builder with the given path", () => {
      const builder = new RouteBuilder("/pet/{petId}", { port: 9999 });

      expect(builder.routePath).toBe("/pet/{petId}");
    });

    it("returns a new instance from method()", () => {
      const original = new RouteBuilder("/pet", { port: 9999 });
      const updated = original.method("get");

      expect(updated).not.toBe(original);
    });

    it("returns a new instance from path()", () => {
      const original = new RouteBuilder("/pet/{petId}", { port: 9999 });
      const updated = original.path({ petId: 1 });

      expect(updated).not.toBe(original);
    });

    it("returns a new instance from query()", () => {
      const original = new RouteBuilder("/pet/findByStatus", { port: 9999 });
      const updated = original.query({ status: "sold" });

      expect(updated).not.toBe(original);
    });

    it("returns a new instance from headers()", () => {
      const original = new RouteBuilder("/pet", { port: 9999 });
      const updated = original.headers({ Authorization: "Bearer token" });

      expect(updated).not.toBe(original);
    });

    it("returns a new instance from body()", () => {
      const original = new RouteBuilder("/pet", { port: 9999 });
      const updated = original.body({ name: "Rex" });

      expect(updated).not.toBe(original);
    });

    it("preserves existing values when chaining", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      })
        .method("get")
        .path({ petId: 1 });

      expect(builder.ready()).toBe(true);
    });

    it("supports branching (immutable)", () => {
      const base = new RouteBuilder("/pet/{petId}", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      }).method("get");

      const pet1 = base.path({ petId: 1 });
      const pet2 = base.path({ petId: 2 });

      expect(pet1.routePath).toBe("/pet/{petId}");
      expect(pet2.routePath).toBe("/pet/{petId}");
    });
  });

  describe("ready()", () => {
    it("returns false when no method is set", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      });

      expect(builder.ready()).toBe(false);
    });

    it("returns false when required path params are missing", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      }).method("get");

      expect(builder.ready()).toBe(false);
    });

    it("returns true when all required params are provided", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      })
        .method("get")
        .path({ petId: 1 });

      expect(builder.ready()).toBe(true);
    });

    it("returns true when optional params are omitted", () => {
      const builder = new RouteBuilder("/pet/findByStatus", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      }).method("get");

      expect(builder.ready()).toBe(true);
    });

    it("returns true when no OpenAPI document is provided", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        port: 9999,
      }).method("get");

      expect(builder.ready()).toBe(true);
    });
  });

  describe("missing()", () => {
    it("returns undefined when all required params are provided", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      })
        .method("get")
        .path({ petId: 1 });

      expect(builder.missing()).toBeUndefined();
    });

    it("returns missing path params", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      }).method("get");

      const missing = builder.missing();

      expect(missing?.path).toEqual([
        { name: "petId", type: "integer", description: undefined },
      ]);
    });

    it("returns undefined when no OpenAPI document is provided", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        port: 9999,
      }).method("get");

      expect(builder.missing()).toBeUndefined();
    });

    it("does not include optional params in missing list", () => {
      const builder = new RouteBuilder("/pet/findByStatus", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      }).method("get");

      expect(builder.missing()).toBeUndefined();
    });
  });

  describe("help()", () => {
    it("includes the method and path", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      }).method("get");

      const help = builder.help();

      expect(help).toContain("GET /pet/{petId}");
    });

    it("includes path parameter info", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      }).method("get");

      const help = builder.help();

      expect(help).toContain("petId (integer, required)");
    });

    it("includes query parameter info with allowed values", () => {
      const builder = new RouteBuilder("/pet/findByStatus", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      }).method("get");

      const help = builder.help();

      expect(help).toContain("status (string, optional)");
      expect(help).toContain("available | pending | sold");
    });

    it("includes response status codes", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      }).method("get");

      const help = builder.help();

      expect(help).toContain("200");
      expect(help).toContain("404");
    });

    it("shows [no method set] when no method is configured", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      });

      expect(builder.help()).toContain("[no method set]");
    });
  });

  describe("send()", () => {
    it("throws if no method is set", async () => {
      const builder = new RouteBuilder("/pet/{petId}", { port: 9999 });

      await expect(builder.send()).rejects.toThrow("No HTTP method set");
    });

    it("throws with a helpful message when required params are missing", async () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      }).method("get");

      await expect(builder.send()).rejects.toThrow("Cannot execute request.");
    });

    it("throws listing missing path params", async () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      }).method("get");

      await expect(builder.send()).rejects.toThrow("petId");
    });
  });

  describe("inspect output (custom inspect symbol)", () => {
    it("shows method and path", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      }).method("get");

      const inspect = builder[Symbol.for("nodejs.util.inspect.custom")]();

      expect(inspect).toContain("GET /pet/{petId}");
    });

    it("shows [missing] for unset required path params", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      }).method("get");

      const inspect = builder[Symbol.for("nodejs.util.inspect.custom")]();

      expect(inspect).toContain("petId: [missing]");
    });

    it("shows the value for provided path params", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      })
        .method("get")
        .path({ petId: 42 });

      const inspect = builder[Symbol.for("nodejs.util.inspect.custom")]();

      expect(inspect).toContain("petId: 42");
    });

    it("shows [optional] for unset optional query params", () => {
      const builder = new RouteBuilder("/pet/findByStatus", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      }).method("get");

      const inspect = builder[Symbol.for("nodejs.util.inspect.custom")]();

      expect(inspect).toContain("status: [optional]");
    });

    it("shows Ready: false when required params are missing", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      }).method("get");

      const inspect = builder[Symbol.for("nodejs.util.inspect.custom")]();

      expect(inspect).toContain("Ready: false");
    });

    it("shows Ready: true when all required params are provided", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        openApiDocument: OPEN_API_DOCUMENT,
        port: 9999,
      })
        .method("get")
        .path({ petId: 1 });

      const inspect = builder[Symbol.for("nodejs.util.inspect.custom")]();

      expect(inspect).toContain("Ready: true");
    });
  });

  describe("createRouteFunction()", () => {
    it("creates a function that returns a RouteBuilder", () => {
      const routeFn = createRouteFunction(9999);
      const builder = routeFn("/pet");

      expect(builder).toBeInstanceOf(RouteBuilder);
      expect(builder.routePath).toBe("/pet");
    });

    it("passes the OpenAPI document to the builder", () => {
      const routeFn = createRouteFunction(9999, "localhost", OPEN_API_DOCUMENT);

      const builder = routeFn("/pet/{petId}").method("get");

      expect(builder.missing()?.path).toEqual([
        { name: "petId", type: "integer", description: undefined },
      ]);
    });
  });
});
