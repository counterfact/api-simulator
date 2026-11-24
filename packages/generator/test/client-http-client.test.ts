import {
  ContentType,
  HttpClient,
  type HttpResponse,
} from "../templates/client/http-client.js";

type FetchCall = { url: string; init: RequestInit };

/** An HttpClient whose `fetch` records each call and replies with `reply`. */
function recordingClient<SecurityDataType = unknown>(
  reply: () => Response = () => Response.json({ ok: true }),
  config: ConstructorParameters<typeof HttpClient<SecurityDataType>>[0] = {},
) {
  const calls: FetchCall[] = [];
  const client = new HttpClient<SecurityDataType>({
    baseUrl: "https://api.test",
    ...config,
    customFetch: async (input, init = {}) => {
      calls.push({ url: String(input), init });
      return reply();
    },
  });
  return { calls, client };
}

function bearer(token: string | null) {
  return token === null
    ? undefined
    : { headers: { Authorization: `Bearer ${token}` } };
}

function headersOf(call: FetchCall | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(call?.init.headers).entries());
}

describe("generated fetch HttpClient", () => {
  it("joins the base URL, path and query string", async () => {
    const { calls, client } = recordingClient();

    await client.request({
      path: "/users",
      method: "GET",
      query: {
        page: 2,
        tags: ["a", "b"],
        filter: { active: true },
        skipped: undefined,
        empty: null,
      },
    });

    expect(calls[0]?.url).toBe(
      "https://api.test/users?page=2&tags=a&tags=b&filter=%7B%22active%22%3Atrue%7D",
    );
    expect(calls[0]?.init.method).toBe("GET");
  });

  it("lets a request override the base URL and omits an empty query string", async () => {
    const { calls, client } = recordingClient();

    await client.request({
      path: "/ping",
      baseUrl: "https://other.test",
      query: {},
    });

    expect(calls[0]?.url).toBe("https://other.test/ping");
  });

  it("serializes JSON bodies and sets the content type", async () => {
    const { calls, client } = recordingClient();

    await client.request({
      path: "/users",
      method: "POST",
      body: { name: "Ada" },
      type: ContentType.Json,
    });
    await client.request({
      path: "/raw",
      method: "POST",
      body: '{"already":"json"}',
      type: ContentType.JsonApi,
    });

    expect(calls[0]?.init.body).toBe('{"name":"Ada"}');
    expect(headersOf(calls[0])["content-type"]).toBe("application/json");
    expect(calls[1]?.init.body).toBe('{"already":"json"}');
    expect(headersOf(calls[1])["content-type"]).toBe(
      "application/vnd.api+json",
    );
  });

  it("serializes text and URL-encoded bodies", async () => {
    const { calls, client } = recordingClient();
    const search = new URLSearchParams({ a: "1" });

    await client.request({ path: "/t", body: 42, type: ContentType.Text });
    await client.request({ path: "/t", body: "hi", type: ContentType.Text });
    await client.request({
      path: "/f",
      body: { name: "Ada", roles: ["x", "y"] },
      type: ContentType.UrlEncoded,
    });
    await client.request({
      path: "/f",
      body: search,
      type: ContentType.UrlEncoded,
    });

    expect(calls.map(({ init }) => init.body)).toEqual([
      "42",
      "hi",
      "name=Ada&roles=x&roles=y",
      search,
    ]);
  });

  it("builds multipart bodies and leaves the content type to fetch", async () => {
    const { calls, client } = recordingClient();
    const file = new Blob(["png"], { type: "image/png" });
    const existing = new FormData();

    await client.request({
      path: "/uploads",
      method: "POST",
      body: {
        file,
        name: "logo",
        meta: { size: 3 },
        tags: ["a", "b"],
        none: null,
      },
      type: ContentType.FormData,
    });
    await client.request({
      path: "/uploads",
      body: existing,
      type: ContentType.FormData,
    });

    const form = calls[0]?.init.body as FormData;

    expect(form).toBeInstanceOf(FormData);
    expect(form.get("name")).toBe("logo");
    expect(form.get("meta")).toBe('{"size":3}');
    expect(form.getAll("tags")).toEqual(["a", "b"]);
    expect(form.get("file")).toBeInstanceOf(Blob);
    expect(form.has("none")).toBe(false);
    expect(headersOf(calls[0])["content-type"]).toBeUndefined();
    expect(calls[1]?.init.body).toBe(existing);
  });

  it("passes other bodies through and sends no body when there is none", async () => {
    const { calls, client } = recordingClient();
    const blob = new Blob(["bytes"]);

    await client.request({ path: "/bin", method: "PUT", body: blob });
    await client.request({ path: "/none" });

    expect(calls[0]?.init.body).toBe(blob);
    expect(calls[1]?.init.body).toBeNull();
  });

  it("asks the security worker for credentials only for secure requests", async () => {
    const { calls, client } = recordingClient<string>(undefined, {
      securityWorker: bearer,
    });

    await client.request({ path: "/a", secure: true });
    client.setSecurityData("t0ken");
    await client.request({ path: "/b", secure: true });
    await client.request({ path: "/c" });

    expect(headersOf(calls[0])["authorization"]).toBeUndefined();
    expect(headersOf(calls[1])["authorization"]).toBe("Bearer t0ken");
    expect(headersOf(calls[2])["authorization"]).toBeUndefined();
  });

  it("can make every request secure by default", async () => {
    const { calls, client } = recordingClient<string>(undefined, {
      baseApiParams: { secure: true },
      securityWorker: async () => ({ headers: { "X-Key": "k" } }),
    });

    await client.request({ path: "/a" });
    await client.request({ path: "/b", secure: false });

    expect(headersOf(calls[0])["x-key"]).toBe("k");
    expect(headersOf(calls[1])["x-key"]).toBeUndefined();
  });

  it("merges default, security and per-request headers and options", async () => {
    const { calls, client } = recordingClient<string>(undefined, {
      baseApiParams: {
        credentials: "include",
        headers: { "X-App": "tm", "X-Override": "base" },
      },
      securityWorker: () => ({ headers: { Authorization: "Bearer s" } }),
    });

    await client.request({
      path: "/a",
      secure: true,
      headers: new Headers({ "X-Override": "request" }),
      mode: "cors",
    });

    expect(headersOf(calls[0])).toEqual({
      authorization: "Bearer s",
      "x-app": "tm",
      "x-override": "request",
    });
    expect(calls[0]?.init).toEqual(
      expect.objectContaining({
        credentials: "include",
        mode: "cors",
        redirect: "follow",
        referrerPolicy: "no-referrer",
      }),
    );
    for (const key of ["secure", "format", "type", "baseUrl", "cancelToken"]) {
      expect(calls[0]?.init).not.toHaveProperty(key);
    }
  });

  it("reads successful responses into data", async () => {
    const { client } = recordingClient(() => Response.json({ id: 1 }));

    const response = await client.request<{ id: number }>({
      path: "/users/1",
      format: "json",
    });

    expect(response.ok).toBe(true);
    expect(response.data).toEqual({ id: 1 });
    expect(response.error).toBeNull();
    // The body is still readable because the client parses a clone.
    expect(await response.json()).toEqual({ id: 1 });
  });

  it("uses the default response format and leaves data null without one", async () => {
    const withDefault = recordingClient(() => new Response("hello"), {
      baseApiParams: { format: "text" },
    });
    const withoutFormat = recordingClient(
      () => new Response(null, { status: 204 }),
    );

    expect((await withDefault.client.request({ path: "/a" })).data).toBe(
      "hello",
    );
    expect(
      (await withoutFormat.client.request({ path: "/b" })).data,
    ).toBeNull();
  });

  it("rejects with the response, carrying the parsed error, when the status is not 2xx", async () => {
    const { client } = recordingClient(() =>
      Response.json({ message: "nope" }, { status: 400 }),
    );

    const failure = (await client
      .request<unknown, { message: string }>({ path: "/x", format: "json" })
      .catch((error: unknown) => error)) as HttpResponse<
      unknown,
      { message: string }
    >;

    expect(failure.status).toBe(400);
    expect(failure.data).toBeNull();
    expect(failure.error).toEqual({ message: "nope" });
  });

  it("records a body that cannot be parsed as the error", async () => {
    const { client } = recordingClient(() => new Response("not json"));

    const response = await client.request({ path: "/x", format: "json" });

    expect(response.data).toBeNull();
    expect(response.error).toHaveProperty("name", "SyntaxError");
  });

  it("aborts an in-flight request by its cancel token", async () => {
    let seenSignal: AbortSignal | null | undefined;
    const client = new HttpClient({
      customFetch: async (_input, init) => {
        seenSignal = init?.signal;
        client.abortRequest("load");
        return new Response(null, { status: 204 });
      },
    });

    await client.request({ path: "/slow", cancelToken: "load" });

    expect(seenSignal?.aborted).toBe(true);
    // Unknown tokens are ignored.
    expect(() => client.abortRequest("other")).not.toThrow();
  });

  it("shares one abort signal between requests with the same token and frees it afterwards", async () => {
    const signals: Array<AbortSignal | null | undefined> = [];
    const client = new HttpClient({
      customFetch: async (_input, init) => {
        signals.push(init?.signal);
        return new Response(null, { status: 204 });
      },
    });

    await Promise.all([
      client.request({ path: "/a", cancelToken: 1 }),
      client.request({ path: "/b", cancelToken: 1 }),
    ]);
    await client.request({ path: "/c", cancelToken: 1 });

    expect(signals[0]).toBe(signals[1]);
    expect(signals[2]).not.toBe(signals[0]);
  });

  it("passes options it does not know to customFetch, so a wrapped HTTP stack can read them", async () => {
    const { calls, client } = recordingClient();

    await client.request({
      path: "/jobs",
      method: "POST",
      ...({ preferAsync: true } as object),
    });

    expect(calls[0]?.init).toHaveProperty("preferAsync", true);
  });

  it("passes a caller's abort signal through", async () => {
    const controller = new AbortController();
    const { calls, client } = recordingClient();

    await client.request({ path: "/a", signal: controller.signal });

    expect(calls[0]?.init.signal).toBe(controller.signal);
  });

  it("uses the global fetch by default", async () => {
    const original = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = async (input) => {
      urls.push(String(input));
      return new Response(null, { status: 204 });
    };

    try {
      await new HttpClient().request({ path: "/relative" });
    } finally {
      globalThis.fetch = original;
    }

    expect(urls).toEqual(["/relative"]);
  });
});
