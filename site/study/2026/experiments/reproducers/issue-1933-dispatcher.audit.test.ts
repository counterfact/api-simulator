// Note: I cut a few corners here on type checking. Since these are tests, I'm more
// concerned about the tests passing at runtime than lining up the types perfectly.

import { ContextRegistry } from "../../src/server/context-registry.js";
import {
  Dispatcher,
  type OpenApiDocument,
} from "../../src/server/dispatcher.js";
import { Registry } from "../../src/server/registry.js";

function fallbackCookie(value: string | undefined, fallback: string): string {
  return value ?? fallback;
}

function acceptsBody(acceptsHtml: boolean): string {
  return acceptsHtml ? "acceptable" : "unacceptable";
}

describe("a dispatcher", () => {
  it("dispatches a get request to a server and returns the response", async () => {
    const registry = new Registry();

    registry.add("/hello", {
      GET() {
        return {
          body: "hello",
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const response = await dispatcher.request({
      body: "",
      headers: {},
      method: "GET",
      path: "/hello",
      query: {},
      req: { path: "/hello" },
    });

    expect(response.body).toBe("hello");
  });

  it("converts a string return value to a full response object with content-type text/plain", async () => {
    const registry = new Registry();

    registry.add("/hello", {
      GET() {
        return "hello";
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const response = await dispatcher.request({
      body: "",
      headers: {},
      method: "GET",
      path: "/hello",
      query: {},
      req: { path: "/hello" },
    });

    expect(response).toStrictEqual({
      body: "hello",
      contentType: "text/plain",
      headers: {},
      status: 200,
    });
  });

  it("finds the best content item for an accept header", () => {
    const dispatcher = new Dispatcher(new Registry(), new ContextRegistry());

    const html = dispatcher.selectContent("text/html", [
      {
        body: "hello",
        type: "text/plain",
      },
      {
        body: "<h1>hello</h1>",
        type: "text/html",
      },
    ]);

    expect(html?.type).toBe("text/html");
  });

  it("returns HTTP 406 if it can only return content that does not match the accept header", async () => {
    const registry = new Registry();

    registry.add("/hello", {
      GET() {
        return {
          body: "I am not JSON",
          contentType: "text/plain",
          status: 200,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const response = await dispatcher.request({
      body: "",

      headers: {
        accept: "application/json",
      },

      method: "GET",

      path: "/hello",
      query: {},
      req: { path: "/hello" },
    });

    expect(response.status).toBe(406);
  });

  it("does not set status to 406 if the response has no content", async () => {
    const registry = new Registry();

    registry.add("/hello", {
      GET() {
        return {
          status: 200,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const response = await dispatcher.request({
      body: "",

      headers: {
        accept: "application/json",
      },

      method: "GET",

      path: "/hello",
      query: {},
      req: { path: "/hello" },
    });

    expect(response.status).toBe(200);
  });

  it.each([
    ["text/html", ["text/html"], "text/html"],
    ["text/plain", ["text/html", "text/plain"], "text/plain"],
    ["text/*", ["text/html", "text/plain"], "text/html"],
    ["*/json", ["text/html", "application/json"], "application/json"],
    [
      "*/html;q=0.1,*/json;q=0.2",
      ["text/html", "application/json"],
      "application/json",
    ],
  ])(
    'given accept header "%s" and content types: %s, select %s',
    (acceptHeader, types, expected) => {
      const dispatcher = new Dispatcher(new Registry(), new ContextRegistry());

      const content = types.map((type) => ({ body: "", type }));

      expect(dispatcher.selectContent(acceptHeader, content)?.type).toBe(
        expected,
      );
    },
  );

  it("selects the best content item matching the Accepts header", async () => {
    const registry = new Registry();

    registry.add("/hello", {
      GET() {
        return {
          content: [
            {
              body: "Hello, world!",
              type: "text/plain",
            },
            {
              body: "<h1>Hello, world!</h1>",
              type: "text/html",
            },
          ],

          headers: {},

          status: 200,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const html = await dispatcher.request({
      body: "",

      headers: {
        accept: "text/html",
      },

      method: "GET",

      path: "/hello",
      query: {},
      req: { path: "/hello" },
    });

    expect(html).toStrictEqual({
      body: "<h1>Hello, world!</h1>",
      contentType: "text/html",
      headers: {},
      status: 200,
    });
  });

  it("passes the request body", async () => {
    const registry = new Registry();

    registry.add("/a", {
      POST({ body }) {
        const typeSafeBody = body as { name: string; place: string };

        return {
          body: `Hello ${typeSafeBody.name} of ${typeSafeBody.place}!`,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const response = await dispatcher.request({
      body: {
        name: "Catherine",
        place: "Aragon",
      },

      headers: {},

      method: "POST",

      path: "/a",
      query: {},
      req: { path: "/a" },
    });

    expect(response.body).toBe("Hello Catherine of Aragon!");
  });

  it("passes the request headers", async () => {
    const registry = new Registry();
    const mockedJWT = "test token";

    registry.add("/a", {
      GET({ headers }) {
        return {
          headers,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());

    const authHeader = {
      Authorization: `Bearer: ${mockedJWT}`,
      "Cache-Control": "max-age=0",
    };

    const response = await dispatcher.request({
      body: "",
      headers: authHeader,

      method: "GET",
      path: "/a",
      query: {},
      req: { path: "/a" },
    });

    expect(response).toHaveProperty("headers");
    expect(
      (response as typeof response & { headers: typeof authHeader }).headers,
    ).toStrictEqual(authHeader);
  });

  it("passes the query params", async () => {
    const registry = new Registry();

    registry.add("/a", {
      GET({ query }) {
        return {
          body: `Searching for stores near ${String(query.zip)}!`,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const response = await dispatcher.request({
      body: "",
      headers: {},

      method: "GET",

      path: "/a",

      query: {
        zip: "90210",
      },

      req: { path: "/a" },
    });

    expect(response.body).toBe("Searching for stores near 90210!");
  });

  it("passes a tools object", async () => {
    const registry = new Registry();

    registry.add("/a", {
      GET({ tools }) {
        return {
          body: acceptsBody(tools.accepts("text/html")),
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const htmlResponse = await dispatcher.request({
      body: "",

      headers: {
        Accept: "text/html",
      },

      method: "GET",

      path: "/a",
      query: {},
      req: { path: "/a" },
    });

    expect(htmlResponse.body).toBe("acceptable");

    const textResponse = await dispatcher.request({
      body: "",

      headers: {
        Accept: "text/plain",
      },

      method: "GET",

      path: "/a",
      query: {},
      req: { path: "/a" },
    });

    expect(textResponse.body).toBe("unacceptable");
  });

  it("passes a response builder", async () => {
    const registry = new Registry();

    registry.add("/a", {
      // @ts-expect-error - not obvious how to make TS happy here, and it's just a unit test
      GET({ response }) {
        return response["200"]?.text("hello").html("<h1>hello</h1>");
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const htmlResponse = await dispatcher.request({
      body: "",

      headers: {
        accept: "text/html",
      },

      method: "GET",

      path: "/a",
      query: {},
      req: { path: "/a" },
    });

    expect(htmlResponse.body).toBe("<h1>hello</h1>");
  });

  it("passes a binary Buffer body through the response", async () => {
    const registry = new Registry();
    const binaryData = Buffer.from("binary content");

    registry.add("/a", {
      // @ts-expect-error - not obvious how to make TS happy here, and it's just a unit test
      GET({ response }) {
        return response["200"]?.binary(binaryData);
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const binaryResponse = await dispatcher.request({
      body: "",

      headers: {
        accept: "application/octet-stream",
      },

      method: "GET",

      path: "/a",
      query: {},
      req: { path: "/a" },
    });

    expect(binaryResponse.body).toStrictEqual(binaryData);
    expect(binaryResponse.contentType).toBe("application/octet-stream");
  });

  it("decodes a base64 string to a Buffer when binary() is called with a string", async () => {
    const registry = new Registry();
    const originalData = Buffer.from("binary content");
    const base64Data = originalData.toString("base64");

    registry.add("/a", {
      // @ts-expect-error - not obvious how to make TS happy here, and it's just a unit test
      GET({ response }) {
        return response["200"]?.binary(base64Data);
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const binaryResponse = await dispatcher.request({
      body: "",

      headers: {
        accept: "application/octet-stream",
      },

      method: "GET",

      path: "/a",
      query: {},
      req: { path: "/a" },
    });

    expect(Buffer.isBuffer(binaryResponse.body)).toBe(true);
    expect(binaryResponse.body).toStrictEqual(originalData);
    expect(binaryResponse.contentType).toBe("application/octet-stream");
  });

  it("gives the response builder the OpenAPI object it needs to generate a random response", async () => {
    const registry = new Registry();

    registry.add("/a", {
      GET({ response }) {
        return response["200"]?.random();
      },
    });

    const openApiDocument = {
      paths: {
        "/a": {
          get: {
            responses: {
              200: {
                content: {
                  "text/plain": {
                    schema: {
                      examples: ["hello"],
                      type: "string",
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const dispatcher = new Dispatcher(
      registry,
      new ContextRegistry(),
      openApiDocument,
    );
    const htmlResponse = await dispatcher.request({
      body: "",

      headers: {
        accept: "text/plain",
      },

      method: "GET",

      path: "/a",
      query: {},
      req: { path: "/a" },
    });

    expect(htmlResponse.body).toBe("hello");
  });

  it("passes status code in the response", async () => {
    const registry = new Registry();

    registry.add("/stuff", {
      PUT() {
        return {
          body: "ok",
          status: 201,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const response = await dispatcher.request({
      body: "",
      headers: {},
      method: "PUT",
      path: "/stuff",
      query: {},
      req: { path: "/stuff" },
    });

    expect(response.status).toBe(201);
  });

  it("allows the context object to be mutated directly", async () => {
    const registry = new Registry();
    const contextRegistry = new ContextRegistry();
    const rootContext = { value: 0 };

    contextRegistry.add("/", rootContext);

    registry.add("/increment/{value}", {
      // @ts-expect-error - not obvious how to make TS happy here, and it's just a unit test
      GET({
        context,
        path,
      }: {
        context: { value: number };
        path: { value: string };
      }) {
        const amountToIncrement = Number.parseInt(path.value, 10);

        context.value += amountToIncrement;

        return { body: "incremented" };
      },
    });

    const dispatcher = new Dispatcher(registry, contextRegistry);

    const result = await dispatcher.request({
      body: "",
      headers: {},
      method: "GET",
      path: "/increment/1",
      query: {},
      req: { path: "/increment/1" },
    });

    expect(result.body).toBe("incremented");

    expect(rootContext.value).toBe(1);

    await dispatcher.request({
      body: "",
      headers: {},
      method: "GET",
      path: "/increment/2",
      query: {},
      req: { path: "/increment/2" },
    });

    expect(rootContext.value).toBe(3);
  });

  it("passes a context object", async () => {
    const registry = new Registry();
    const contextRegistry = new ContextRegistry();

    contextRegistry.add("/", { id: "test context" });
    registry.add("/echo", {
      GET({ context }) {
        return { body: (context as { id: string }).id };
      },
    });

    const dispatcher = new Dispatcher(registry, contextRegistry);

    const result = await dispatcher.request({
      body: "",
      headers: {},
      method: "GET",
      path: "/echo",
      query: {},
      req: { path: "/echo" },
    });

    expect(result.body).toBe("test context");
  });

  it("passes a context object (not in the root)", async () => {
    const registry = new Registry();
    const contextRegistry = new ContextRegistry();

    contextRegistry.add("/", { id: "test context" });

    contextRegistry.add("/echo/{id}", { id: "echo context" });
    registry.add("/echo/{id}", {
      GET({ context }) {
        return { body: (context as { id: string }).id };
      },
    });

    const dispatcher = new Dispatcher(registry, contextRegistry);

    const result = await dispatcher.request({
      body: "",
      headers: {},
      method: "GET",
      path: "/echo/1",
      query: {},
      req: { path: "/echo/1" },
    });

    expect(result.body).toBe("echo context");
  });

  it("converts query, path, and header parameters to numbers if necessary", async () => {
    const registry = new Registry();

    registry.add("/a/{integerInPath}/{stringInPath}", {
      // @ts-expect-error - not obvious how to make TS happy here, and it's just a unit test
      GET({ headers, path, query, response }) {
        return response["200"]?.text({
          booleanInHeader: headers.booleanInHeader,
          integerInPath: path?.integerInPath,
          numberInHeader: headers.numberInHeader,
          numberInQuery: query.numberInQuery,
          stringInHeader: headers.stringInHeader,
          stringInPath: path?.stringInPath,
          stringInQuery: query.stringInQuery,
        });
      },
    });

    const openApiDocument: OpenApiDocument = {
      paths: {
        "/a/{integerInPath}/{stringInPath}": {
          get: {
            parameters: [
              {
                in: "path",
                name: "integerInPath",
                type: "integer",
              },
              { in: "path", name: "stringInPath", type: "string" },
              {
                in: "query",
                name: "numberInQuery",
                type: "number",
              },
              {
                in: "query",
                name: "stringInQuery",
                type: "string",
              },
              {
                in: "header",
                name: "numberInHeader",
                type: "number",
              },
              {
                in: "header",
                name: "stringInHeader",
                type: "string",
              },
              {
                in: "header",
                name: "booleanInHeader",
                type: "boolean",
              },
            ],

            responses: {
              200: {
                content: {
                  "application/json": {
                    schema: {
                      integerInPath: "number",
                      stringInPath: "string",
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const dispatcher = new Dispatcher(
      registry,
      new ContextRegistry(),
      openApiDocument,
    );
    const htmlResponse = await dispatcher.request({
      body: "",

      headers: {
        numberInHeader: "5",
        stringInHeader: "6",
        booleanInHeader: "true",
      },

      method: "GET",

      path: "/a/1/2",

      query: {
        numberInQuery: "3",
        stringInQuery: "4",
      },

      req: { path: "/a/1/2" },
    });

    expect(htmlResponse.body).toStrictEqual({
      booleanInHeader: true,
      integerInPath: 1,
      numberInHeader: 5,
      numberInQuery: 3,
      stringInHeader: "6",
      stringInPath: "2",
      stringInQuery: "4",
    });
  });

  it("attaches the root produces array to an operation", () => {
    const registry = new Registry();

    registry.add("/hello", {
      GET() {
        return {
          body: "ok",
          status: 200,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry(), {
      paths: {
        "/hello": {
          get: {
            responses: {
              200: {
                content: {
                  "text/plain": {
                    schema: {
                      type: "string",
                    },
                  },
                },
              },
            },
          },
        },
      },

      produces: ["text/plain"],
    });

    const operation = dispatcher.operationForPathAndMethod("/hello", "GET");

    expect(operation).not.toBeUndefined();
    expect(operation?.produces).toStrictEqual(["text/plain"]);
  });

  it("provides a cookie proxy that reads a single cookie", async () => {
    const registry = new Registry();

    registry.add("/a", {
      GET($) {
        const { session } = $.cookie;

        return {
          body: fallbackCookie(session, "missing"),
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const response = await dispatcher.request({
      body: "",
      headers: { cookie: "session=abc123" },
      method: "GET",
      path: "/a",
      query: {},
      req: { path: "/a" },
    });

    expect(response.body).toBe("abc123");
  });

  it("provides a cookie proxy that reads one of multiple cookies", async () => {
    const registry = new Registry();

    registry.add("/a", {
      GET($) {
        const { theme } = $.cookie;

        return {
          body: fallbackCookie(theme, "missing"),
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const response = await dispatcher.request({
      body: "",
      headers: { cookie: "session=abc123; theme=dark; lang=en" },
      method: "GET",
      path: "/a",
      query: {},
      req: { path: "/a" },
    });

    expect(response.body).toBe("dark");
  });

  it("provides a cookie proxy that returns undefined for a missing cookie", async () => {
    const registry = new Registry();

    registry.add("/a", {
      GET($) {
        const { missing } = $.cookie;

        return {
          body: fallbackCookie(missing, "not-found"),
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const response = await dispatcher.request({
      body: "",
      headers: { cookie: "session=abc123" },
      method: "GET",
      path: "/a",
      query: {},
      req: { path: "/a" },
    });

    expect(response.body).toBe("not-found");
  });

  it("provides a cookie proxy that returns undefined when no Cookie header is present", async () => {
    const registry = new Registry();

    registry.add("/a", {
      GET($) {
        const { session } = $.cookie;

        return {
          body: fallbackCookie(session, "no-cookie"),
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const response = await dispatcher.request({
      body: "",
      headers: {},
      method: "GET",
      path: "/a",
      query: {},
      req: { path: "/a" },
    });

    expect(response.body).toBe("no-cookie");
  });

  it("provides a cookie proxy that handles whitespace around cookie names and values", async () => {
    const registry = new Registry();

    registry.add("/a", {
      GET($) {
        const { key } = $.cookie;

        return {
          body: fallbackCookie(key, "missing"),
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const response = await dispatcher.request({
      body: "",
      headers: { cookie: "  key  =  value  " },
      method: "GET",
      path: "/a",
      query: {},
      req: { path: "/a" },
    });

    expect(response.body).toBe("value");
  });

  it("provides a cookie proxy that URL-decodes cookie values", async () => {
    const registry = new Registry();

    registry.add("/a", {
      GET($) {
        const { data } = $.cookie;

        return {
          body: fallbackCookie(data, "missing"),
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const response = await dispatcher.request({
      body: "",
      headers: { cookie: "data=hello%20world" },
      method: "GET",
      path: "/a",
      query: {},
      req: { path: "/a" },
    });

    expect(response.body).toBe("hello world");
  });

  it("provides a cookie proxy that does not throw on malformed cookie headers", async () => {
    const registry = new Registry();

    registry.add("/a", {
      GET($) {
        const { ok } = $.cookie;

        return {
          body: fallbackCookie(ok, "safe"),
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const response = await dispatcher.request({
      body: "",
      headers: { cookie: "noequals; ok=yes; =emptykey; garbled%%%" },
      method: "GET",
      path: "/a",
      query: {},
      req: { path: "/a" },
    });

    expect(response.body).toBe("yes");
  });

  it("provides a cookie proxy that returns the first occurrence when duplicate cookie names exist", async () => {
    const registry = new Registry();

    registry.add("/a", {
      GET($) {
        const { id } = $.cookie;

        return {
          body: fallbackCookie(id, "missing"),
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const response = await dispatcher.request({
      body: "",
      headers: { cookie: "id=first; id=second" },
      method: "GET",
      path: "/a",
      query: {},
      req: { path: "/a" },
    });

    expect(response.body).toBe("first");
  });
});

describe("given an invalid path", () => {
  it("returns a 404 when the route is not found", async () => {
    const registry = new Registry();

    registry.add("/your/{side}/{bodyPart}/in/and/your/left/foot/out", {
      PUT() {
        return {
          body: "ok",
          status: 201,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());

    const response = await dispatcher.request({
      body: "",
      headers: {},
      method: "PUT",
      path: "/your/left/foot/in/and/your/right/foot/out",
      query: {},
      req: { path: "/your/left/foot/in/and/your/right/foot/out" },
    });

    expect(response.status).toBe(404);

    expect(response.body).toBe(
      "Could not find a PUT method matching /your/left/foot/in/and/your/right/foot/out\n",
    );
  });

  it("returns a 405 when the path exists but the method is not registered", async () => {
    const registry = new Registry();

    registry.add("/hello", {
      GET() {
        return {
          body: "hello",
          status: 200,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());

    const response = await dispatcher.request({
      body: "",
      headers: {},
      method: "POST",
      path: "/hello",
      query: {},
      req: { path: "/hello" },
    });

    expect(response.status).toBe(405);
    expect(response.body).toBe("The POST method is not allowed for /hello\n");
    expect(response.headers?.allow).toBe("GET");
  });

  it("returns a 405 when a wildcard path exists but the method is not registered", async () => {
    const registry = new Registry();

    registry.add("/{id}", {
      GET() {
        return {
          body: "hello",
          status: 200,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());

    const response = await dispatcher.request({
      body: "",
      headers: {},
      method: "DELETE",
      path: "/123",
      query: {},
      req: { path: "/123" },
    });

    expect(response.status).toBe(405);
    expect(response.body).toBe("The DELETE method is not allowed for /123\n");
    expect(response.headers?.allow).toBe("GET");
  });

  it("responds with a 500 error if the handler function does not return", async () => {
    const registry = new Registry();

    registry.add("/hello", {
      GET() {
        return undefined;
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry());
    const response = await dispatcher.request({
      body: "",
      headers: {},
      method: "GET",
      path: "/hello",
      query: {},
      req: { path: "/hello" },
    });

    expect(response.status).toBe(500);
    expect(response.body).toBe(
      "The GET function did not return anything. Did you forget a return statement?",
    );
  });
});

describe("given a request that contains the OpenApi basePath", () => {
  it("strips the basePath from the path before finding the associated handler", async () => {
    const registry = new Registry();

    registry.add("/abc", {
      POST() {
        return {
          body: "ok",
          status: 200,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry(), {
      basePath: "/api",

      paths: {
        "/abc": {
          post: {
            responses: {
              200: {
                content: {
                  "text/plain": {
                    schema: {
                      type: "string",
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const response = await dispatcher.request({
      body: "",
      headers: {},
      method: "POST",
      path: "/api/abc",
      query: {},
      req: { path: "/api/abc" },
    });

    expect(response.status).toBe(200);

    expect(response.body).toBe("ok");
  });
});

describe("given a request that contains the differently cased path", () => {
  it("correctly returns the desired path response even when case of path does not match", async () => {
    const registry = new Registry();

    registry.add("/abc", {
      POST() {
        return {
          body: "ok",
          status: 200,
        };
      },
    });

    const dispatcher = new Dispatcher(registry, new ContextRegistry(), {
      paths: {
        "/Abc": {
          post: {
            responses: {
              200: {
                content: {
                  "text/plain": {
                    schema: {
                      type: "string",
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    let response = await dispatcher.request({
      body: "",
      headers: {},
      method: "POST",
      path: "/abc",
      query: {},
      req: { path: "/abc" },
    });

    expect(response.status).toBe(200);

    expect(response.body).toBe("ok");

    response = await dispatcher.request({
      body: "",
      headers: {},
      method: "POST",
      path: "/ABC",
      query: {},
      req: { path: "/ABC" },
    });

    expect(response.status).toBe(200);

    expect(response.body).toBe("ok");
  });

  describe("request validation", () => {
    const openApiDocument: OpenApiDocument = {
      paths: {
        "/widgets": {
          post: {
            parameters: [
              { in: "query", name: "required-query", required: true },
              { in: "query", name: "optional-query" },
              { in: "header", name: "x-required-header", required: true },
            ],
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    properties: {
                      name: { type: "string" },
                    },
                    required: ["name"],
                    type: "object",
                  },
                },
              },
            },
            responses: {
              200: {
                content: { "text/plain": { schema: { type: "string" } } },
              },
            },
          },
        },
      },
    };

    function makeDispatcher(
      validateRequests: boolean,
      validateResponses = true,
    ) {
      const registry = new Registry();

      registry.add("/widgets", {
        POST() {
          return { body: "ok", status: 200 };
        },
      });

      return new Dispatcher(registry, new ContextRegistry(), openApiDocument, {
        adminApiToken: "",
        alwaysFakeOptionals: false,
        basePath: "/",
        buildCache: false,
        generate: { routes: false, types: false },
        openApiPath: "",
        port: 3100,
        proxyPaths: new Map(),
        proxyUrl: "",
        prefix: "",
        startAdminApi: false,
        startRepl: false,
        startServer: true,
        validateRequests,
        validateResponses,
        watch: { routes: false, types: false },
      });
    }

    it("returns 400 when a required query parameter is missing", async () => {
      const dispatcher = makeDispatcher(true);

      const response = await dispatcher.request({
        body: { name: "sprocket" },
        headers: { "x-required-header": "yes" },
        method: "POST",
        path: "/widgets",
        query: {},
        req: { path: "/widgets" },
      });

      expect(response.status).toBe(400);
      expect(response.body).toContain("required-query");
    });

    it("returns 400 when a required header is missing", async () => {
      const dispatcher = makeDispatcher(true);

      const response = await dispatcher.request({
        body: { name: "sprocket" },
        headers: {},
        method: "POST",
        path: "/widgets",
        query: { "required-query": "yes" },
        req: { path: "/widgets" },
      });

      expect(response.status).toBe(400);
      expect(response.body).toContain("x-required-header");
    });

    it("returns 400 when the request body is missing a required field", async () => {
      const dispatcher = makeDispatcher(true);

      const response = await dispatcher.request({
        body: {},
        headers: { "x-required-header": "yes" },
        method: "POST",
        path: "/widgets",
        query: { "required-query": "yes" },
        req: { path: "/widgets" },
      });

      expect(response.status).toBe(400);
      expect(response.body).toContain("name");
    });

    it("returns 200 when all required parameters and body are valid", async () => {
      const dispatcher = makeDispatcher(true);

      const response = await dispatcher.request({
        body: { name: "sprocket" },
        headers: { "x-required-header": "yes" },
        method: "POST",
        path: "/widgets",
        query: { "required-query": "yes" },
        req: { path: "/widgets" },
      });

      expect(response.status).toBe(200);
    });

    it("skips validation when validateRequests is false", async () => {
      const dispatcher = makeDispatcher(false);

      const response = await dispatcher.request({
        body: {},
        headers: {},
        method: "POST",
        path: "/widgets",
        query: {},
        req: { path: "/widgets" },
      });

      expect(response.status).toBe(200);
    });

    it("skips validation when there is no OpenAPI document", async () => {
      const registry = new Registry();

      registry.add("/widgets", {
        POST() {
          return { body: "ok", status: 200 };
        },
      });

      const dispatcher = new Dispatcher(registry, new ContextRegistry());

      const response = await dispatcher.request({
        body: {},
        headers: {},
        method: "POST",
        path: "/widgets",
        query: {},
        req: { path: "/widgets" },
      });

      expect(response.status).toBe(200);
    });
  });

  describe("exploded object query parameters", () => {
    const openApiDocumentWithExplodedParam: OpenApiDocument = {
      paths: {
        "/items": {
          get: {
            parameters: [
              {
                in: "query",
                name: "pageable",
                required: true,
                schema: {
                  type: "object",
                  properties: {
                    page: { type: "integer" },
                    size: { type: "integer" },
                    sort: { type: "array", items: { type: "string" } },
                  },
                },
              },
            ],
            responses: {
              200: {
                content: { "text/plain": { schema: { type: "string" } } },
              },
            },
          },
        },
      },
    };

    function makeExplodedDispatcher() {
      const registry = new Registry();
      let capturedQuery: unknown;

      registry.add("/items", {
        GET({ query }) {
          capturedQuery = query;
          return { body: "ok", status: 200 };
        },
      });

      const dispatcher = new Dispatcher(
        registry,
        new ContextRegistry(),
        openApiDocumentWithExplodedParam,
        {
          adminApiToken: "",
          alwaysFakeOptionals: false,
          basePath: "/",
          buildCache: false,
          generate: { routes: false, types: false },
          openApiPath: "",
          port: 3100,
          proxyPaths: new Map(),
          proxyUrl: "",
          prefix: "",
          startAdminApi: false,
          startRepl: false,
          startServer: true,
          validateRequests: true,
          validateResponses: false,
          watch: { routes: false, types: false },
        },
      );

      return { dispatcher, getCapturedQuery: () => capturedQuery };
    }

    it("accepts a request when object properties are sent as individual query params", async () => {
      const { dispatcher } = makeExplodedDispatcher();

      const response = await dispatcher.request({
        body: undefined,
        headers: {},
        method: "GET",
        path: "/items",
        query: { page: "0", size: "100" },
        req: { path: "/items" },
      });

      expect(response.status).toBe(200);
    });

    it("rejects a request when no object properties are provided and the parameter is required", async () => {
      const { dispatcher } = makeExplodedDispatcher();

      const response = await dispatcher.request({
        body: undefined,
        headers: {},
        method: "GET",
        path: "/items",
        query: {},
        req: { path: "/items" },
      });

      expect(response.status).toBe(400);
      expect(response.body).toContain("pageable");
    });

    it("reconstructs the object under the parameter name for the handler", async () => {
      const { dispatcher, getCapturedQuery } = makeExplodedDispatcher();

      await dispatcher.request({
        body: undefined,
        headers: {},
        method: "GET",
        path: "/items",
        query: { page: "0", size: "100" },
        req: { path: "/items" },
      });

      expect(getCapturedQuery()).toEqual({
        pageable: { page: "0", size: "100" },
      });
    });

    it("preserves unrelated query params outside the object", async () => {
      const { dispatcher, getCapturedQuery } = makeExplodedDispatcher();

      await dispatcher.request({
        body: undefined,
        headers: {},
        method: "GET",
        path: "/items",
        query: { page: "0", unrelated: "yes" },
        req: { path: "/items" },
      });

      expect(getCapturedQuery()).toEqual({
        pageable: { page: "0" },
        unrelated: "yes",
      });
    });
  });

  describe("response validation", () => {
    const openApiDocument: OpenApiDocument = {
      paths: {
        "/widgets": {
          get: {
            responses: {
              200: {
                content: { "text/plain": { schema: { type: "string" } } },
                headers: {
                  "x-required-header": {
                    required: true,
                    schema: { type: "string" },
                  },
                  "x-count": {
                    required: false,
                    schema: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    };

    function makeResponseDispatcher(
      validateResponses: boolean,
      handlerHeaders: Record<string, string> = {},
    ) {
      const registry = new Registry();

      registry.add("/widgets", {
        GET() {
          return { body: "ok", headers: handlerHeaders, status: 200 };
        },
      });

      return new Dispatcher(registry, new ContextRegistry(), openApiDocument, {
        adminApiToken: "",
        alwaysFakeOptionals: false,
        basePath: "/",
        buildCache: false,
        generate: { routes: false, types: false },
        openApiPath: "",
        port: 3100,
        proxyPaths: new Map(),
        proxyUrl: "",
        prefix: "",
        startAdminApi: false,
        startRepl: false,
        startServer: true,
        validateRequests: false,
        validateResponses,
        watch: { routes: false, types: false },
      });
    }

    it("adds response-type-error headers when a required response header is missing", async () => {
      const dispatcher = makeResponseDispatcher(true);

      const response = await dispatcher.request({
        body: "",
        headers: {},
        method: "GET",
        path: "/widgets",
        query: {},
        req: { path: "/widgets" },
      });

      const errorValues = response.appendedHeaders
        ?.filter(([key]) => key === "response-type-error")
        .map(([, value]) => value);

      expect(errorValues?.[0]).toContain("x-required-header");
    });

    it("adds response-type-error headers when a response header has the wrong type", async () => {
      const dispatcher = makeResponseDispatcher(true, {
        "x-required-header": "present",
        "x-count": "not-a-number",
      });

      const response = await dispatcher.request({
        body: "",
        headers: {},
        method: "GET",
        path: "/widgets",
        query: {},
        req: { path: "/widgets" },
      });

      const errorValues = response.appendedHeaders
        ?.filter(([key]) => key === "response-type-error")
        .map(([, value]) => value);

      expect(errorValues?.[0]).toContain("x-count");
    });

    it("does not add error headers when all required response headers are present and valid", async () => {
      const dispatcher = makeResponseDispatcher(true, {
        "x-required-header": "present",
        "x-count": "42",
      });

      const response = await dispatcher.request({
        body: "",
        headers: {},
        method: "GET",
        path: "/widgets",
        query: {},
        req: { path: "/widgets" },
      });

      expect(
        response.appendedHeaders?.find(
          ([key]) => key === "response-type-error",
        ),
      ).toBeUndefined();
    });

    it("skips response validation when validateResponses is false", async () => {
      const dispatcher = makeResponseDispatcher(false);

      const response = await dispatcher.request({
        body: "",
        headers: {},
        method: "GET",
        path: "/widgets",
        query: {},
        req: { path: "/widgets" },
      });

      expect(
        response.appendedHeaders?.find(
          ([key]) => key === "response-type-error",
        ),
      ).toBeUndefined();
    });
  });
});
