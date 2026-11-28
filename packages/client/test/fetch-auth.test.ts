import { expect, it, jest } from "@jest/globals";

import {
  createFetchRoute,
  RequestAuthenticationError,
  type FetchClientOptions,
  type FetchOperation,
} from "../src/fetch.js";

type Operation = {
  path: Record<never, never>;
  query: Record<never, never>;
  headers: Record<never, never>;
  cookies: Record<never, never>;
  bodyRequired: false;
  body: never;
  responses: { "401": { mediaType: undefined; body: undefined } };
};
type Operations = Record<"/orders", { get: Operation }>;

const schemes = {
  userToken: { type: "bearer" },
  tenantKey: { type: "apiKey", location: "header", name: "X-Tenant-Key" },
  projectKey: { type: "apiKey", location: "query", name: "key" },
  session: { type: "apiKey", location: "cookie", name: "session" },
} as const;

const bearer = { userToken: ["orders:read"] };
const tokenOrAnonymous = [{}, bearer];
const twoKeys = { tenantKey: [], projectKey: [] };

function fixture(
  security: FetchOperation["security"],
  options: Partial<FetchClientOptions> = {},
) {
  const fetch = jest.fn<typeof globalThis.fetch>();
  fetch.mockImplementation(async () => new Response(null, { status: 401 }));
  const route = createFetchRoute<Operations>(
    {
      "/orders": { get: { parameters: [], responses: { 401: [] }, security } },
    },
    { baseUrl: "https://example.test/api", fetch, ...options },
    {},
    schemes,
  );
  return { request: route("/orders").method("get"), fetch };
}

it("prefers auth over an earlier anonymous choice and preserves a documented 401", async () => {
  const signal = new AbortController().signal;
  const userToken = jest.fn(async () => "access-token");
  const { request, fetch } = fixture(tokenOrAnonymous, { auth: { userToken } });
  const result = await request.send({ signal });
  expect(result.matchedStatus).toBe("401");
  expect(userToken).toHaveBeenCalledWith({ scopes: ["orders:read"], signal });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({
    headers: new Headers({ authorization: "Bearer access-token" }),
    redirect: "error",
    signal,
  });
});

it("opts out of auth and uses Fetch options per request", async () => {
  const userToken = jest.fn(() => "access-token");
  const { request, fetch } = fixture(tokenOrAnonymous, {
    baseUrl: "https://example.test/api?keep=1&key=existing",
    auth: { userToken },
    credentials: "include",
    headers: {
      Authorization: "Bearer existing",
      "X-Tenant-Key": "secret",
      Cookie: "session=existing",
      "X-Other": "keep",
    },
  });
  await request.send({ authenticate: false, redirect: "manual" });
  expect(userToken).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledWith(
    new URL("https://example.test/api/orders?keep=1"),
    expect.objectContaining({
      headers: new Headers({ "X-Other": "keep" }),
      credentials: "omit",
      redirect: "manual",
    }),
  );
  await request.send({ credentials: "same-origin", redirect: "follow" });
  expect(fetch.mock.calls[1]?.[1]).toMatchObject({
    credentials: "same-origin",
    redirect: "follow",
  });
});

it("falls back to anonymous only if the operation and caller allow it", async () => {
  const { request, fetch } = fixture(tokenOrAnonymous, {
    auth: { userToken: () => undefined },
    headers: { Authorization: "Bearer stale" },
  });
  await expect(request.send()).resolves.toMatchObject({ status: 401 });
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({
    credentials: "omit",
    headers: new Headers(),
  });
  await expect(request.send({ authenticate: true })).rejects.toBeInstanceOf(
    RequestAuthenticationError,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("requires all schemes in a selected alternative and tries the next if a provider has no credential", async () => {
  const { request, fetch } = fixture([twoKeys, bearer], {
    auth: {
      tenantKey: () => "available",
      projectKey: () => undefined,
      userToken: () => "fallback",
    },
  });
  await request.send();
  expect(fetch).toHaveBeenCalledWith(
    new URL("https://example.test/api/orders"),
    expect.objectContaining({
      headers: new Headers({ Authorization: "Bearer fallback" }),
    }),
  );
});

it("applies both API keys when the next alternative supplies both", async () => {
  const { request, fetch } = fixture([bearer, twoKeys], {
    baseUrl: "https://example.test/api?selection=a,b&key=old&key=another",
    auth: {
      tenantKey: () => "header-value",
      projectKey: async () => "query&value",
    },
  });
  await request.send();
  expect(fetch).toHaveBeenCalledWith(
    new URL("https://example.test/api/orders?selection=a,b&key=query%26value"),
    expect.objectContaining({
      headers: new Headers({ "X-Tenant-Key": "header-value" }),
      redirect: "error",
    }),
  );
});

it("rejects missing credentials and explicit anonymous access before sending a required operation", async () => {
  const { request, fetch } = fixture([bearer]);
  await expect(request.send()).rejects.toThrow("No credentials available");
  await expect(request.send({ authenticate: false })).rejects.toThrow(
    "requires authentication",
  );
  expect(fetch).not.toHaveBeenCalled();
});

it("does not look up credentials for a public operation", async () => {
  const userToken = jest.fn(() => "access-token");
  const { request, fetch } = fixture([], { auth: { userToken } });
  await request.send();
  expect(userToken).not.toHaveBeenCalled();
  await expect(request.send({ authenticate: true })).rejects.toBeInstanceOf(
    RequestAuthenticationError,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("propagates credential provider failures without trying another alternative", async () => {
  const failure = new Error("token source unavailable");
  const tenantKey = jest.fn(() => "key");
  const { request, fetch } = fixture([bearer, { tenantKey: [] }, {}], {
    auth: {
      userToken: async () => {
        throw failure;
      },
      tenantKey,
    },
  });
  await expect(request.send()).rejects.toBe(failure);
  expect(tenantKey).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it("allows a cookie provider to opt in to browser-managed credentials", async () => {
  const { request, fetch } = fixture([{ session: [] }], {
    auth: { session: () => ({ credentials: "include" }) },
  });
  await request.send();
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({
    credentials: "include",
    headers: new Headers(),
  });
  await expect(request.send({ credentials: "omit" })).rejects.toBeInstanceOf(
    RequestAuthenticationError,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("does not send if the request is canceled while resolving credentials", async () => {
  const controller = new AbortController();
  const cancellation = new Error("canceled");
  const { request, fetch } = fixture([bearer], {
    auth: {
      userToken: async () => {
        await Promise.resolve();
        controller.abort(cancellation);
        return "unused";
      },
    },
  });
  await expect(request.send({ signal: controller.signal })).rejects.toBe(
    cancellation,
  );
  expect(fetch).not.toHaveBeenCalled();
});
