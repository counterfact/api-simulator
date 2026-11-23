import { expect, it } from "@jest/globals";

import { createFetchRoute, type FetchOperation } from "../src/fetch.js";

type Post = {
  path: { tenantId: string; orderId: number };
  query: { states: string[] };
  headers: { "X-Request-Id": string };
  cookies: Record<never, never>;
  body: { updated: boolean };
  bodyRequired: true;
  responses: {
    "200": { mediaType: "application/json"; body: { accepted: boolean } };
    "204": { mediaType: undefined; body: undefined };
    "4XX": { mediaType: "text/plain"; body: string };
  };
};

type Operations = { "/{tenantId}/v1/orders/{orderId}": { post: Post } };
const operation: FetchOperation = {
  parameters: [
    {
      name: "tenantId",
      location: "path",
      style: "simple",
      required: true,
      explode: false,
    },
    {
      name: "orderId",
      location: "path",
      style: "simple",
      required: true,
      explode: false,
    },
    {
      name: "states",
      location: "query",
      style: "form",
      required: true,
      explode: true,
    },
    {
      name: "X-Request-Id",
      location: "headers",
      style: "simple",
      required: true,
      explode: false,
    },
  ],
  body: { mediaType: "application/json", required: true },
  responses: { 200: ["application/json"], 204: [], "4XX": ["text/plain"] },
};

const operations = { "/{tenantId}/v1/orders/{orderId}": { post: operation } };

it("sends an immutable descendant request over Fetch once all required values are set", async () => {
  const called: unknown[] = [];
  const route = createFetchRoute<Operations>(operations, {
    baseUrl: "https://example.test/api?env=test",
    fetch: async (url, init) => {
      const request = new Request(url, init);
      called.push({
        url: request.url,
        method: request.method,
        requestId: request.headers.get("x-request-id"),
        type: request.headers.get("content-type"),
        body: await request.text(),
      });
      return Response.json(
        { accepted: true },
        {
          headers: { "content-type": "application/json; charset=utf-8" },
        },
      );
    },
  });
  const base = route("/{tenantId}/v1");
  const tenant = base.path({ tenantId: "a/b" });
  const post = tenant.segment("orders/{orderId}").method("post");
  const partial = post
    .path({ orderId: 42 })
    .query({ states: ["new", "on hold"] });
  expect("send" in partial).toBe(false);
  const withHeaders = partial.headers({ "X-Request-Id": "test" });
  expect("send" in withHeaders).toBe(false);
  const result = await withHeaders.body({ updated: true }).send();
  const second = await withHeaders
    .path({ orderId: 43 })
    .body({ updated: false })
    .send();

  expect(called).toEqual([
    {
      url: "https://example.test/api/a%2Fb/v1/orders/42?env=test&states=new&states=on%20hold",
      method: "POST",
      requestId: "test",
      type: "application/json",
      body: '{"updated":true}',
    },
    {
      url: "https://example.test/api/a%2Fb/v1/orders/43?env=test&states=new&states=on%20hold",
      method: "POST",
      requestId: "test",
      type: "application/json",
      body: '{"updated":false}',
    },
  ]);
  expect(result).toMatchObject({
    status: 200,
    matchedStatus: "200",
    body: { accepted: true },
  });
  expect(second.status).toBe(200);
  expect(await result.response.json()).toEqual({ accepted: true });
  expect("send" in post).toBe(false);
});

it.each([
  {
    status: 429,
    content: "slow down",
    headers: { "Content-Type": "text/plain" },
    expected: { matchedStatus: "4XX", body: "slow down" },
  },
  {
    status: 204,
    content: null,
    headers: undefined,
    expected: { matchedStatus: "204", body: undefined },
  },
  {
    status: 200,
    content: "wrong type",
    headers: { "Content-Type": "text/plain" },
    expected: { matchedStatus: undefined, body: expect.any(ArrayBuffer) },
  },
  {
    status: 500,
    content: "unexpected",
    headers: { "Content-Type": "text/plain" },
    expected: { matchedStatus: undefined, body: expect.any(ArrayBuffer) },
  },
])(
  "reports declared and unexpected responses for HTTP $status",
  async ({ status, content, headers, expected }) => {
    const signal = new AbortController().signal;
    const route = createFetchRoute<Operations>(operations, {
      baseUrl: new URL("https://example.test"),
      fetch: async (_url, init) => {
        expect(init?.signal).toBe(signal);
        return new Response(content, {
          status,
          headers,
        });
      },
    });
    const result = await route("/{tenantId}/v1/orders/{orderId}")
      .method("post")
      .path({ tenantId: "acme", orderId: 42 })
      .query({ states: ["open"] })
      .headers({ "X-Request-Id": "test" })
      .body({ updated: true })
      .send({ signal });
    expect(result).toMatchObject({ status, ...expected });
  },
);

it("serializes labeled and matrix paths and structured query, header, and cookie values", async () => {
  type Structured = {
    path: { label: readonly string[]; matrix: Record<string, number> };
    query: {
      filter: { state: string };
      tags: readonly string[];
      data: { sort: string };
      fragment: string;
    };
    headers: { "X-Fields": { id: number; active: boolean } };
    cookies: { session: string };
    body: never;
    bodyRequired: false;
    responses: { "200": { mediaType: undefined; body: undefined } };
  };
  const route = createFetchRoute<{ "/{label}/{matrix}": { get: Structured } }>(
    {
      "/{label}/{matrix}": {
        get: {
          parameters: [
            {
              name: "label",
              location: "path",
              required: true,
              style: "label",
              explode: true,
            },
            {
              name: "matrix",
              location: "path",
              required: true,
              style: "matrix",
              explode: true,
            },
            {
              name: "filter",
              location: "query",
              required: true,
              style: "deepObject",
              explode: true,
            },
            {
              name: "tags",
              location: "query",
              required: true,
              style: "pipeDelimited",
              explode: false,
            },
            {
              name: "data",
              location: "query",
              required: true,
              style: "form",
              explode: true,
              contentType: "application/json",
            },
            {
              name: "fragment",
              location: "query",
              required: true,
              style: "form",
              explode: true,
              allowReserved: true,
            },
            {
              name: "X-Fields",
              location: "headers",
              required: true,
              style: "simple",
              explode: true,
            },
            {
              name: "session",
              location: "cookies",
              required: true,
              style: "form",
              explode: true,
            },
          ],
          responses: { 200: [] },
        },
      },
    },
    {
      baseUrl: "https://example.test",
      headers: { cookie: "existing=1" },
      fetch: async (url, init) => {
        const request = new Request(url, init);
        expect(request.url).toBe(
          "https://example.test/.a.b/;page=0?filter[state]=needs%20review&tags=x|y&data=%7B%22sort%22%3A%22date%22%7D&fragment=a/b%2Bc%26d",
        );
        expect(request.headers.get("x-fields")).toBe("id=0,active=false");
        expect(request.headers.get("cookie")).toBe("existing=1; session=a%3Bb");
        return new Response("");
      },
    },
  );
  const result = await route("/")
    .segment("{label}/{matrix}")
    .method("get")
    .path({ label: ["a", "b"], matrix: { page: 0 } })
    .query({
      filter: { state: "needs review" },
      tags: ["x", "y"],
      data: { sort: "date" },
      fragment: "a/b+c&d",
    })
    .headers({ "X-Fields": { id: 0, active: false } })
    .cookies({ session: "a;b" })
    .send();
  expect(result).toMatchObject({ matchedStatus: "200", body: undefined });
});

it.each([
  {
    mediaType: "text/plain",
    body: "foo",
    type: /^text\/plain/u,
    payload: "foo",
  },
  {
    mediaType: "application/x-www-form-urlencoded",
    body: new URLSearchParams({ field: "a b" }),
    type: /^application\/x-www-form-urlencoded/u,
    payload: "field=a+b",
  },
  {
    mediaType: "application/octet-stream",
    body: new Blob(["octets"]),
    type: /^application\/octet-stream/u,
    payload: "octets",
  },
  {
    mediaType: "multipart/form-data",
    body: new FormData(),
    type: /^multipart\/form-data; boundary=/u,
    payload: expect.stringContaining("--"),
  },
])(
  "serializes $mediaType and decodes a default binary response",
  async ({ mediaType, body, type, payload }) => {
    type Body = {
      path: Record<never, never>;
      query: Record<never, never>;
      headers: Record<never, never>;
      cookies: Record<never, never>;
      body: string | Blob | FormData | URLSearchParams;
      bodyRequired: false;
      responses: {
        default: { mediaType: "application/octet-stream"; body: ArrayBuffer };
      };
    };
    const route = createFetchRoute<{ "/": { post: Body } }>(
      {
        "/": {
          post: {
            parameters: [],
            body: { mediaType, required: false },
            responses: { default: ["application/octet-stream"] },
          },
        },
      },
      {
        baseUrl: "https://example.test",
        fetch: async (url, init) => {
          const request = new Request(url, init);
          expect(request.headers.get("content-type")).toMatch(type);
          expect(await request.text()).toEqual(payload);
          return new Response("bytes", {
            status: 409,
            headers: { "content-type": "application/octet-stream" },
          });
        },
      },
    );
    const result = await route("/").method("post").body(body).send();
    expect(result).toMatchObject({
      matchedStatus: "default",
      status: 409,
      body: expect.any(ArrayBuffer),
    });
  },
);

it("rejects an encoded value that would be normalized into a different path", async () => {
  const route = createFetchRoute<Operations>(operations, {
    baseUrl: "https://example.test",
    fetch: async () => {
      throw new Error("Fetch must not run");
    },
  });
  const request = route("/{tenantId}/v1/orders/{orderId}")
    .method("post")
    .path({ tenantId: ".." })
    .path({ orderId: 0 })
    .query({ states: ["open"] })
    .headers({ "X-Request-Id": "test" })
    .body({ updated: false });
  await expect(request.send()).rejects.toThrow(/dot-segment path/u);
});
