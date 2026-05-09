import { jest } from "@jest/globals";

import {
  Registry,
  type RequestDataWithBody,
} from "../../src/server/registry.js";

function fallbackPathSegment(value: unknown): string {
  return value == null ? "???" : String(value);
}

describe("a registry", () => {
  it("knows if a handler exists for a request method at a path", () => {
    const registry = new Registry();

    registry.add("/hello", {
      async GET() {
        await Promise.resolve("noop");

        return { body: "hello", headers: {}, status: 200 };
      },
    });

    expect(registry.exists("GET", "/hello")).toBe(true);
    expect(registry.exists("POST", "/hello")).toBe(false);
    expect(registry.exists("GET", "/goodbye")).toBe(false);
  });

  it.todo("returns debug information if path does not exist");

  it("returns a function matching the URL and request method", async () => {
    const registry = new Registry();

    registry.add("/a", {
      async GET() {
        await Promise.resolve("noop");

        return "GET a";
      },

      async POST() {
        await Promise.resolve("noop");

        return "POST a";
      },
    });
    registry.add("/b", {
      async GET() {
        await Promise.resolve("noop");

        return "GET b";
      },

      async POST() {
        await Promise.resolve("noop");

        return "POST b";
      },
    });

    const props = {
      context: {},

      headers: {},
      matchedPath: "",
      path: {},

      query: {},
    };

    // @ts-expect-error - chill out, TypeScript
    const getA = await registry.endpoint("GET", "/a")(props);

    // @ts-expect-error - chill out, TypeScript
    const getB = await registry.endpoint("GET", "/b")(props);

    // @ts-expect-error - chill out, TypeScript
    const postA = await registry.endpoint("POST", "/a")(props);

    // @ts-expect-error - chill out, TypeScript
    const postB = await registry.endpoint("POST", "/b")(props);

    expect(getA?.body).toBe("GET a");
    expect(getB?.body).toBe("GET b");
    expect(postA?.body).toBe("POST a");
    expect(postB?.body).toBe("POST b");
  });

  it("handles a dynamic path", async () => {
    const registry = new Registry();

    registry.add("/{organization}/users/{username}/friends/{page}", {
      GET({ path }) {
        return {
          body: `page ${String(path?.page)} of ${String(
            path?.username,
          )}'s friends in ${String(path?.organization)}`,

          headers: { "content-type": "text/plain" },

          status: 200,
        };
      },
    });

    expect(
      await registry.endpoint(
        "GET",
        "/acme/users/alice/friends/2",

        // @ts-expect-error - not creating an entire request object
      )({ headers: {}, matchedPath: "", path: {}, query: {} }),
    ).toStrictEqual({
      body: "page 2 of alice's friends in acme",
      headers: { "content-type": "text/plain" },
      status: 200,
    });
  });

  it("applies middlewares", async () => {
    const registry = new Registry();

    registry.addMiddleware("/", async ($: RequestDataWithBody, respondTo) => {
      const response = await respondTo($);
      response.body += " augmented";
      response.status = 201;
      response.headers = { ...response.headers, "x-augmented": "true" };
      return response;
    });

    registry.add("/admin/users", {
      GET() {
        return {
          body: "users",
          headers: { "content-type": "text/plain" },
          status: 200,
        };
      },
    });

    expect(
      await registry.endpoint(
        "GET",
        "/admin/users",

        // @ts-expect-error - not creating an entire request object
      )({ headers: {}, matchedPath: "", path: {}, query: {} }),
    ).toStrictEqual({
      body: "users augmented",
      headers: { "content-type": "text/plain", "x-augmented": "true" },
      status: 201,
    });
  });

  it("applies multiple middlewares", async () => {
    const registry = new Registry();

    registry.addMiddleware("/", async ($: RequestDataWithBody, respondTo) => {
      const response = await respondTo($);
      response.body += " root";
      return response;
    });

    registry.addMiddleware(
      "/admin",
      async ($: RequestDataWithBody, respondTo) => {
        const response = await respondTo($);
        response.body += " admin";

        return response;
      },
    );

    registry.add("/admin/users", {
      GET() {
        return {
          body: "users",
          headers: { "content-type": "text/plain" },
          status: 200,
        };
      },
    });

    expect(
      (
        await registry.endpoint(
          "GET",
          "/admin/users",

          // @ts-expect-error - not creating an entire request object
        )({ headers: {}, matchedPath: "", path: {}, query: {} })
      )?.body,
    ).toStrictEqual("users admin root");
  });

  it("applies root middleware to all routes", async () => {
    const registry = new Registry();

    registry.addMiddleware("/", async ($: RequestDataWithBody, respondTo) => {
      const response = await respondTo($);
      response.body += " from root";
      return response;
    });

    registry.add("/devices", {
      GET() {
        return {
          body: "devices",
          headers: { "content-type": "text/plain" },
          status: 200,
        };
      },
    });

    expect(
      (
        await registry.endpoint(
          "GET",
          "/devices",

          // @ts-expect-error - not creating an entire request object
        )({ headers: {}, matchedPath: "", path: {}, query: {} })
      )?.body,
    ).toStrictEqual("devices from root");
  });

  it("matches an endpoint where the case does not match", async () => {
    const registry = new Registry();

    registry.add("/{organization}/users/{username}/friends/{page}", {
      async GET({ path }) {
        return {
          body: `page ${fallbackPathSegment(path?.page)} of ${fallbackPathSegment(path?.username)}'s friends in ${fallbackPathSegment(path?.organization)}`,
        };
      },
    });

    expect(
      await registry.endpoint(
        "GET",
        "/Acme/users/alice/Friends/2",
      )({} as RequestDataWithBody),
    ).toStrictEqual({
      body: "page 2 of alice's friends in Acme",
    });
  });

  it("returns a 500 response when wildcard paths are ambiguous", async () => {
    const registry = new Registry();
    const stderrSpy = jest
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    registry.add("/a/{x}", {
      GET() {
        return { body: "x", status: 200 };
      },
    });

    registry.add("/a/{y}", {
      GET() {
        return { body: "y", status: 200 };
      },
    });

    const props = {
      context: {},
      headers: {},
      matchedPath: "",
      path: {},
      query: {},
    };

    // @ts-expect-error - chill out, TypeScript
    const response = await registry.endpoint("GET", "/a/something")(props);

    expect(response?.status).toBe(500);
    expect(response?.body).toContain("Ambiguous wildcard paths");

    stderrSpy.mockRestore();
  });

  it("registers and routes a QUERY request", async () => {
    const registry = new Registry();

    registry.add("/search", {
      QUERY({ body }: { body: { filter: string } }) {
        return {
          body: `results for: ${body.filter}`,
          headers: {},
          status: 200,
        };
      },
    });

    expect(registry.exists("QUERY", "/search")).toBe(true);
    expect(registry.exists("GET", "/search")).toBe(false);

    const props = {
      context: {},
      headers: {},
      matchedPath: "",
      path: {},
      query: {},
      body: { filter: "cats" },
    };

    // @ts-expect-error - not creating an entire request object
    const response = await registry.endpoint("QUERY", "/search")(props);

    expect(response?.body).toBe("results for: cats");
    expect(response?.status).toBe(200);
  });

  it("includes QUERY in allowedMethods", () => {
    const registry = new Registry();

    registry.add("/search", {
      QUERY() {
        return { status: 200 };
      },
    });

    expect(registry.allowedMethods("/search")).toContain("QUERY");
  });

  it("lists all of the routes", () => {
    const registry = new Registry();

    registry.add("/a", {});
    registry.add("/b", {});
    registry.add("/c", {});
    registry.add("/c/d", {});
    registry.add("/c/d/e/f/g", {});
    registry.add("/a/in/order", {});
    registry.add("/c/a", {});
    registry.add("/c/{b}", {});
    registry.add("/c/c", {});

    expect(registry.routes.map((route) => route.path)).toStrictEqual([
      "/a",
      "/a/in/order",
      "/b",
      "/c",
      "/c/a",
      "/c/{b}",
      "/c/c",
      "/c/d",
      "/c/d/e/f/g",
    ]);
  });
});
