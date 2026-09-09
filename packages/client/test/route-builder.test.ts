import { inspect } from "node:util";

import { describe, expect, it, jest } from "@jest/globals";

import {
  RawHttpClient,
  RouteBuilder,
  createOpenApiRouteCatalog,
  createRouteFunction,
  type OpenApiRouteDocument,
} from "../src/index.js";

const OPEN_API_DOCUMENT: OpenApiRouteDocument = {
  paths: {
    "/complete/{id}": {
      get: {
        description: "Every supported kind of parameter",
        parameters: [
          {
            description: "The identifier",
            enum: ["one", "two"],
            in: "path",
            name: "id",
            required: true,
            type: "string",
          },
          {
            description: "The result filter",
            in: "query",
            name: "filter",
            required: true,
            schema: { enum: ["active", "all"], type: "string" },
          },
          {
            description: "An access token",
            in: "header",
            name: "x-token",
            required: true,
            type: "string",
          },
        ],
        responses: {
          "200": { description: "Complete" },
          "204": {},
        },
        summary: "Complete operation",
      },
    },
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
const ROUTE_CATALOG = createOpenApiRouteCatalog(OPEN_API_DOCUMENT);
const REQUIRED_INPUT_CATALOG = createOpenApiRouteCatalog({
  paths: {
    "/cookies": {
      get: {
        parameters: [
          {
            description: "Browser session",
            in: "cookie",
            name: "session",
            required: true,
            type: "string",
          },
        ],
        responses: { "200": {} },
      },
    },
    "/oas2/body": {
      post: {
        parameters: [
          {
            description: "Legacy payload",
            in: "body",
            name: "payload",
            required: true,
            schema: { type: "object" },
          },
        ],
        responses: { "200": {} },
      },
    },
    "/oas2/form": {
      post: {
        consumes: ["application/x-www-form-urlencoded"],
        parameters: [
          {
            description: "Account name",
            in: "formData",
            name: "username",
            required: true,
            type: "string",
          },
          {
            in: "formData",
            name: "remember",
            required: false,
            type: "boolean",
          },
        ],
        responses: { "200": {} },
      },
    },
    "/oas3/form": {
      post: {
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: { type: "object" },
            },
          },
          description: "Modern form payload",
          required: true,
        },
        responses: { "200": {} },
      },
    },
    "/oas3/json": {
      post: {
        requestBody: {
          content: {
            "application/json": { schema: { type: "object" } },
          },
          description: "Modern JSON payload",
          required: true,
        },
        responses: { "200": {} },
      },
    },
  },
});

function captureHelp(builder: RouteBuilder): string {
  const log = jest.spyOn(console, "log").mockImplementation(() => undefined);

  try {
    expect(builder.help()).toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);

    return String(log.mock.calls[0]?.[0]);
  } finally {
    log.mockRestore();
  }
}

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

    it("returns a new instance from cookies()", () => {
      const original = new RouteBuilder("/pet", { port: 9999 });
      const updated = original.cookies({ session: "abc" });

      expect(updated).not.toBe(original);
    });

    it("returns a new instance from form()", () => {
      const original = new RouteBuilder("/pet", { port: 9999 });
      const updated = original.form({ name: "Rex" });

      expect(updated).not.toBe(original);
    });

    it("preserves existing values when chaining", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        routeCatalog: ROUTE_CATALOG,
        port: 9999,
      })
        .method("get")
        .path({ petId: 1 });

      expect(builder.ready()).toBe(true);
    });

    it("supports branching (immutable)", () => {
      const base = new RouteBuilder("/pet/{petId}", {
        routeCatalog: ROUTE_CATALOG,
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
        routeCatalog: ROUTE_CATALOG,
        port: 9999,
      });

      expect(builder.ready()).toBe(false);
    });

    it("returns false when required path params are missing", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        routeCatalog: ROUTE_CATALOG,
        port: 9999,
      }).method("get");

      expect(builder.ready()).toBe(false);
    });

    it("returns true when all required params are provided", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        routeCatalog: ROUTE_CATALOG,
        port: 9999,
      })
        .method("get")
        .path({ petId: 1 });

      expect(builder.ready()).toBe(true);
    });

    it("returns true when optional params are omitted", () => {
      const builder = new RouteBuilder("/pet/findByStatus", {
        routeCatalog: ROUTE_CATALOG,
        port: 9999,
      }).method("get");

      expect(builder.ready()).toBe(true);
    });

    it("includes required path-item parameters", () => {
      const catalog = createOpenApiRouteCatalog({
        paths: {
          "/path-item/{id}": {
            get: { responses: { "200": {} } },
            parameters: [
              {
                in: "path",
                name: "id",
                required: true,
                type: "string",
              },
            ],
          },
        },
      });
      const builder = new RouteBuilder("/path-item/{id}", {
        port: 9999,
        routeCatalog: catalog,
      }).method("get");

      expect(builder.ready()).toBe(false);
      expect(builder.missing()?.path).toEqual([
        { description: undefined, name: "id", type: "string" },
      ]);
      expect(builder.path({ id: "one" }).ready()).toBe(true);
    });

    it("returns true when no OpenAPI document is provided", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        port: 9999,
      }).method("get");

      expect(builder.ready()).toBe(true);
    });

    it("requires body() for a required OpenAPI 2 body parameter", () => {
      const builder = new RouteBuilder("/oas2/body", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      }).method("post");

      expect(builder.ready()).toBe(false);
      expect(builder.form({ payload: "wrong entity" }).ready()).toBe(false);
      expect(builder.body({ accepted: true }).ready()).toBe(true);
    });

    it("does not treat an undefined body as a supplied required body", () => {
      const swagger2 = new RouteBuilder("/oas2/body", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      }).method("post");
      const openapi3 = new RouteBuilder("/oas3/json", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      }).method("post");

      expect(swagger2.body(undefined).ready()).toBe(false);
      expect(
        swagger2
          .body(undefined)
          .missing()
          ?.body?.map(({ name }) => name),
      ).toEqual(["payload"]);
      expect(openapi3.body(undefined).ready()).toBe(false);
      expect(
        openapi3
          .body(undefined)
          .missing()
          ?.body?.map(({ name }) => name),
      ).toEqual(["requestBody"]);
      expect(openapi3.body(null).ready()).toBe(true);
    });

    it("requires every required OpenAPI 2 formData field in form()", () => {
      const builder = new RouteBuilder("/oas2/form", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      })
        .method("post")
        .form({ remember: true });

      expect(builder.ready()).toBe(false);
      expect(builder.form({ username: "patrick" }).ready()).toBe(true);
    });

    it("uses body or form for OpenAPI 3 requestBody according to content", () => {
      const json = new RouteBuilder("/oas3/json", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      }).method("post");
      const form = new RouteBuilder("/oas3/form", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      }).method("post");

      expect(json.form({ name: "Rex" }).ready()).toBe(false);
      expect(json.body({ name: "Rex" }).ready()).toBe(true);
      expect(form.body({ name: "Rex" }).ready()).toBe(false);
      expect(form.form({ name: "Rex" }).ready()).toBe(true);
    });

    it("clears the competing request entity when body() or form() is called", () => {
      const json = new RouteBuilder("/oas3/json", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      }).method("post");
      const form = new RouteBuilder("/oas3/form", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      }).method("post");

      expect(json.body({ name: "Rex" }).form({ name: "Fluffy" }).ready()).toBe(
        false,
      );
      expect(form.form({ name: "Rex" }).body({ name: "Fluffy" }).ready()).toBe(
        false,
      );
    });
  });

  describe("missing()", () => {
    it("returns undefined when all required params are provided", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        routeCatalog: ROUTE_CATALOG,
        port: 9999,
      })
        .method("get")
        .path({ petId: 1 });

      expect(builder.missing()).toBeUndefined();
    });

    it("returns missing path params", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        routeCatalog: ROUTE_CATALOG,
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
        routeCatalog: ROUTE_CATALOG,
        port: 9999,
      }).method("get");

      expect(builder.missing()).toBeUndefined();
    });

    it("reports required path, query, and header parameters", () => {
      const builder = new RouteBuilder("/complete/{id}", {
        port: 9999,
        routeCatalog: ROUTE_CATALOG,
      }).method("get");

      expect(builder.missing()).toEqual({
        header: [
          {
            description: "An access token",
            name: "x-token",
            type: "string",
          },
        ],
        path: [
          {
            description: "The identifier",
            name: "id",
            type: "string",
          },
        ],
        query: [
          {
            description: "The result filter",
            name: "filter",
            type: "string",
          },
        ],
      });

      expect(
        builder
          .path({ id: "one" })
          .query({ filter: "active" })
          .headers({ "x-token": "secret" })
          .ready(),
      ).toBe(true);
    });

    it("treats required header names case-insensitively", () => {
      const builder = new RouteBuilder("/complete/{id}", {
        port: 9999,
        routeCatalog: ROUTE_CATALOG,
      })
        .method("get")
        .path({ id: "one" })
        .query({ filter: "active" })
        .headers({ "X-Token": "secret" });

      expect(builder.ready()).toBe(true);
      expect(builder.missing()).toBeUndefined();
    });

    it("reports and satisfies required cookies", () => {
      const builder = new RouteBuilder("/cookies", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      }).method("get");

      expect(builder.missing()?.cookie).toEqual([
        {
          description: "Browser session",
          name: "session",
          type: "string",
        },
      ]);
      expect(builder.cookies({ session: "abc" }).missing()).toBeUndefined();
    });

    it("accepts required cookies from a case-insensitive Cookie header", () => {
      const builder = new RouteBuilder("/cookies", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      })
        .method("get")
        .headers({ cOoKiE: "session=abc; theme=dark" });

      expect(builder.missing()).toBeUndefined();
    });

    it("reports required OpenAPI 2 body and formData inputs", () => {
      const body = new RouteBuilder("/oas2/body", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      }).method("post");
      const form = new RouteBuilder("/oas2/form", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      }).method("post");

      expect(body.missing()?.body?.map(({ name }) => name)).toEqual([
        "payload",
      ]);
      expect(form.missing()?.formData?.map(({ name }) => name)).toEqual([
        "username",
      ]);
    });

    it("reports a required OpenAPI 3 requestBody", () => {
      const builder = new RouteBuilder("/oas3/json", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      }).method("post");

      expect(builder.missing()?.body).toEqual([
        {
          description: "Modern JSON payload",
          name: "requestBody",
          type: "object",
        },
      ]);
    });
  });

  describe("help()", () => {
    it("includes the method and path", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        routeCatalog: ROUTE_CATALOG,
        port: 9999,
      }).method("get");

      const help = captureHelp(builder);

      expect(help).toContain("GET /pet/{petId}");
    });

    it("includes path parameter info", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        routeCatalog: ROUTE_CATALOG,
        port: 9999,
      }).method("get");

      const help = captureHelp(builder);

      expect(help).toContain("petId (integer, required)");
    });

    it("includes query parameter info with allowed values", () => {
      const builder = new RouteBuilder("/pet/findByStatus", {
        routeCatalog: ROUTE_CATALOG,
        port: 9999,
      }).method("get");

      const help = captureHelp(builder);

      expect(help).toContain("status (string, optional)");
      expect(help).toContain("available | pending | sold");
    });

    it("includes response status codes", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        routeCatalog: ROUTE_CATALOG,
        port: 9999,
      }).method("get");

      const help = captureHelp(builder);

      expect(help).toContain("200");
      expect(help).toContain("404");
    });

    it("shows [no method set] when no method is configured", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        routeCatalog: ROUTE_CATALOG,
        port: 9999,
      });

      expect(captureHelp(builder)).toContain("[no method set]");
    });

    it("documents summaries, descriptions, headers, and parameter enums", () => {
      const help = captureHelp(
        new RouteBuilder("/complete/{id}", {
          port: 9999,
          routeCatalog: ROUTE_CATALOG,
        }).method("get"),
      );

      expect(help).toContain("Complete operation");
      expect(help).toContain("Every supported kind of parameter");
      expect(help).toContain("The identifier");
      expect(help).toContain("one | two");
      expect(help).toContain("active | all");
      expect(help).toContain("Headers:");
      expect(help).toContain("An access token");
      expect(help).toContain("204");
    });

    it("documents cookie, formData, and OpenAPI 2 body inputs", () => {
      const cookieHelp = captureHelp(
        new RouteBuilder("/cookies", {
          port: 9999,
          routeCatalog: REQUIRED_INPUT_CATALOG,
        }).method("get"),
      );
      const formHelp = captureHelp(
        new RouteBuilder("/oas2/form", {
          port: 9999,
          routeCatalog: REQUIRED_INPUT_CATALOG,
        }).method("post"),
      );
      const bodyHelp = captureHelp(
        new RouteBuilder("/oas2/body", {
          port: 9999,
          routeCatalog: REQUIRED_INPUT_CATALOG,
        }).method("post"),
      );

      expect(cookieHelp).toContain("Cookies:");
      expect(cookieHelp).toContain("session (string, required)");
      expect(formHelp).toContain("Form Fields:");
      expect(formHelp).toContain("username (string, required)");
      expect(bodyHelp).toContain("Request Body:");
      expect(bodyHelp).toContain("payload (object, required)");
    });

    it("documents OpenAPI 3 requestBody content", () => {
      const help = captureHelp(
        new RouteBuilder("/oas3/form", {
          port: 9999,
          routeCatalog: REQUIRED_INPUT_CATALOG,
        }).method("post"),
      );

      expect(help).toContain("requestBody (required)");
      expect(help).toContain("Modern form payload");
      expect(help).toContain("application/x-www-form-urlencoded");
    });
  });

  describe("send()", () => {
    it("throws if no method is set", async () => {
      const builder = new RouteBuilder("/pet/{petId}", { port: 9999 });

      await expect(builder.send()).rejects.toThrow("No HTTP method set");
    });

    it("throws with a helpful message when required params are missing", async () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        routeCatalog: ROUTE_CATALOG,
        port: 9999,
      }).method("get");

      await expect(builder.send()).rejects.toThrow("Cannot execute request.");
    });

    it("throws listing missing path params", async () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        routeCatalog: ROUTE_CATALOG,
        port: 9999,
      }).method("get");

      await expect(builder.send()).rejects.toThrow("petId");
    });

    it("lists missing query and header parameters", async () => {
      const builder = new RouteBuilder("/complete/{id}", {
        port: 9999,
        routeCatalog: ROUTE_CATALOG,
      })
        .method("get")
        .path({ id: "one" });

      await expect(builder.send()).rejects.toThrow(/filter[\s\S]*x-token/u);
    });

    it("lists missing cookie, formData, and body inputs", async () => {
      const cookie = new RouteBuilder("/cookies", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      }).method("get");
      const form = new RouteBuilder("/oas2/form", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      }).method("post");
      const body = new RouteBuilder("/oas3/json", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      }).method("post");

      await expect(cookie.send()).rejects.toThrow(/cookie:[\s\S]*session/u);
      await expect(form.send()).rejects.toThrow(/formData:[\s\S]*username/u);
      await expect(body.send()).rejects.toThrow(/body:[\s\S]*requestBody/u);
    });

    it("rejects unsupported HTTP methods", async () => {
      const builder = new RouteBuilder("/pets", { port: 9999 }).method("brew");

      await expect(builder.send()).rejects.toThrow(
        "Unsupported HTTP method: BREW",
      );
    });

    it("encodes path parameter values before sending", async () => {
      const get = jest
        .spyOn(RawHttpClient.prototype, "get")
        .mockResolvedValue("HTTP/1.1 200 OK");

      try {
        await new RouteBuilder("/pet/{petId}", {
          port: 9999,
          routeCatalog: ROUTE_CATALOG,
        })
          .method("get")
          .path({ petId: "one/two?admin=true#details" })
          .send();

        expect(get).toHaveBeenCalledWith(
          "/pet/one%2Ftwo%3Fadmin%3Dtrue%23details",
          {},
        );
      } finally {
        get.mockRestore();
      }
    });
  });

  describe("inspect output (custom inspect symbol)", () => {
    it("shows method and path", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        routeCatalog: ROUTE_CATALOG,
        port: 9999,
      }).method("get");

      const inspect = builder[Symbol.for("nodejs.util.inspect.custom")]();

      expect(inspect).toContain("GET /pet/{petId}");
    });

    it("shows [missing] for unset required path params", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        routeCatalog: ROUTE_CATALOG,
        port: 9999,
      }).method("get");

      const inspect = builder[Symbol.for("nodejs.util.inspect.custom")]();

      expect(inspect).toContain("petId: [missing]");
    });

    it("shows the value for provided path params", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        routeCatalog: ROUTE_CATALOG,
        port: 9999,
      })
        .method("get")
        .path({ petId: 42 });

      const inspect = builder[Symbol.for("nodejs.util.inspect.custom")]();

      expect(inspect).toContain("petId: 42");
    });

    it("shows [optional] for unset optional query params", () => {
      const builder = new RouteBuilder("/pet/findByStatus", {
        routeCatalog: ROUTE_CATALOG,
        port: 9999,
      }).method("get");

      const inspect = builder[Symbol.for("nodejs.util.inspect.custom")]();

      expect(inspect).toContain("status: [optional]");
    });

    it("shows Ready: false when required params are missing", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        routeCatalog: ROUTE_CATALOG,
        port: 9999,
      }).method("get");

      const inspect = builder[Symbol.for("nodejs.util.inspect.custom")]();

      expect(inspect).toContain("Ready: false");
    });

    it("shows Ready: true when all required params are provided", () => {
      const builder = new RouteBuilder("/pet/{petId}", {
        routeCatalog: ROUTE_CATALOG,
        port: 9999,
      })
        .method("get")
        .path({ petId: 1 });

      const inspect = builder[Symbol.for("nodejs.util.inspect.custom")]();

      expect(inspect).toContain("Ready: true");
    });

    it("shows required cookies and form fields", () => {
      const cookieInspect = new RouteBuilder("/cookies", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      })
        .method("get")
        .cookies({ session: "abc" });
      const formInspect = new RouteBuilder("/oas2/form", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      })
        .method("post")
        .form({ username: "patrick" });

      expect(inspect(cookieInspect)).toContain("Cookies:");
      expect(inspect(cookieInspect)).toContain("session: abc");
      expect(inspect(formInspect)).toContain("Form:");
      expect(inspect(formInspect)).toContain("username: patrick");
    });

    it("shows whether an OpenAPI 3 request body is set with body or form", () => {
      const missingBuilder = new RouteBuilder("/oas3/json", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      }).method("post");
      const bodyBuilder = new RouteBuilder("/oas3/json", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      })
        .method("post")
        .body({ name: "Rex" });
      const formBuilder = new RouteBuilder("/oas3/form", {
        port: 9999,
        routeCatalog: REQUIRED_INPUT_CATALOG,
      })
        .method("post")
        .form({ name: "Rex" });

      expect(inspect(missingBuilder)).toContain("requestBody: [missing]");
      expect(inspect(bodyBuilder)).toContain("requestBody: [set with body()]");
      expect(inspect(formBuilder)).toContain("requestBody: [set with form()]");
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
      const routeFn = createRouteFunction(9999, "localhost", ROUTE_CATALOG);

      const builder = routeFn("/pet/{petId}").method("get");

      expect(builder.missing()?.path).toEqual([
        { name: "petId", type: "integer", description: undefined },
      ]);
    });
  });
});
