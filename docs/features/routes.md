# Routes

Each file in `routes/` corresponds to an API path. For example, `/users/{userId}` maps to `routes/users/{userId}.ts`. The root path `/` maps to `routes/index.ts`.

A freshly generated route file looks like this:

```ts
export const GET: HTTP_GET = ($) => {
  return $.response[200].random();
};

export const POST: HTTP_POST = ($) => {
  return $.response[200].random();
};
```

Each exported function handles one HTTP method. The single argument `$` gives you everything you need: request data, response builders, server state, and utilities.

> [!TIP]
> If you know Express, think of `$` as a type-safe combination of `req` and `res`.

## Building responses with `$.response`

`$.response` is a fluent builder for HTTP responses. Start by picking a status code, then chain one or more methods:

| Method                         | Description                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `.random()`                    | Returns random data generated from the OpenAPI schema (uses `examples` where available) |
| `.example(name)`               | Returns a specific named example from the OpenAPI spec                                  |
| `.json(content)`               | Returns a JSON body (also converts to XML automatically when the client requests it)    |
| `.text(content)`               | Returns a plain-text body                                                               |
| `.html(content)`               | Returns an HTML body                                                                    |
| `.xml(content)`                | Returns an XML body                                                                     |
| `.match(contentType, content)` | Returns a body with an explicit content type; chain multiple for content negotiation    |
| `.header(name, value)`         | Adds a response header                                                                  |

```ts
return $.response[200].header("x-request-id", "abc123").json({ ok: true });
```

### Setting cookies

Use `.cookie(name, value, options?)` to set one or more cookies. Each call appends a new `Set-Cookie` header and returns the builder for chaining.

```ts
return $.response[200]
  .cookie("sessionId", "abc123", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
  })
  .json({ ok: true });
```

Multiple cookies:

```ts
return $.response[200]
  .cookie("sessionId", "abc123")
  .cookie("theme", "dark")
  .json({ ok: true });
```

Supported options:

| Option | Description |
|--------|-------------|
| `path` | Cookie path (e.g. `"/"`) |
| `domain` | Cookie domain |
| `maxAge` | Max age in seconds (`Max-Age`) |
| `expires` | Expiry `Date` object (`Expires`) |
| `httpOnly` | Sets the `HttpOnly` flag when `true` |
| `secure` | Sets the `Secure` flag when `true` |
| `sameSite` | `"lax"`, `"strict"`, or `"none"` (`SameSite`) |

### Using named examples

If your OpenAPI spec defines named examples for a response, you can return a specific one by name using `.example()`. The name is autocompleted and type-checked — passing an unknown name is a compile error.

```ts
// Return a specific named example
return $.response[200].example("successResponse");

// Chain additional decorations after selecting an example
return $.response[200]
  .example("successResponse")
  .header("x-request-id", "abc123");
```

> [!TIP]
> Your IDE's autocomplete knows which status codes, headers, and response shapes are valid for each endpoint — based directly on your OpenAPI spec. If you omit a required header, TypeScript will tell you. When the spec changes and types are regenerated, TypeScript will surface any mismatches.

## Reading request data

The request is exposed through four typed properties:

| Property    | Contents                                                     |
| ----------- | ------------------------------------------------------------ |
| `$.path`    | Path parameters (e.g. `$.path.userId` for `/users/{userId}`) |
| `$.query`   | Query string parameters                                      |
| `$.headers` | Request headers                                              |
| `$.body`    | Request body                                                 |

```ts
export const GET: HTTP_GET = ($) => {
  if ($.headers["x-token"] !== "super-secret") {
    return $.response[401].text("Unauthorized");
  }

  const content =
    `Results for "${$.query.keyword}" in ${$.path.groupName}` +
    ` with tags: ${$.body.tags.join(", ")}`;

  return $.response[200].text(content);
};
```

All four objects are typed from your OpenAPI spec, so autocomplete works for parameter names and values.

### Object query parameters (exploded form style)

When a query parameter has `type: object` in the spec, OpenAPI's default serialisation is _exploded form style_: each property of the object becomes its own query parameter.

For example, a `pageable` parameter of type `Pageable` (with `page`, `size`, and `sort` properties) is sent like this:

```
GET /items?page=0&size=100&sort=name
```

Counterfact automatically assembles these individual query parameters back into the object, so you can access them as:

```ts
export const GET: HTTP_GET = ($) => {
  const { page, size, sort } = $.query.pageable;
  // page = "0", size = "100", sort = "name"
  // ...
};
```

This behaviour follows the OpenAPI 3.x defaults (`style: form`, `explode: true`) and also applies when those values are set explicitly. To opt out, set `explode: false` on the parameter in your spec.

## Basic auth: `$.auth`

When a request includes HTTP Basic credentials, they're available at `$.auth.username` and `$.auth.password`.

Support for other security schemes (API key, OAuth 2, OpenID Connect, mutual TLS) is planned. [Open an issue](https://github.com/pmcelhaney/counterfact/issues) to help prioritize.

## Simulating latency: `$.delay()`

Counterfact responds much faster than a real server. To test loading states and timeouts, use `$.delay()`:

```ts
// pause for exactly one second
await $.delay(1000);

// pause for a random duration between 1 and 5 seconds
await $.delay(1000, 5000);
```

## Escaping the type system: `$.x`

Counterfact translates your OpenAPI spec into strict TypeScript types. If your spec is incomplete, or you need to return something outside the spec (like a `500` error that isn't documented), the strict types can get in the way.

`$.x` is an alias for `$` with all types widened to `any`, giving you an escape hatch:

```ts
export const GET: HTTP_GET = ($) => {
  // header not defined in OpenAPI spec
  $.headers["my-undocumented-header"]; // TypeScript error
  $.x.headers["my-undocumented-header"]; // ok

  // status code not defined in OpenAPI spec
  return $.response[500].text("Error!"); // TypeScript error
  return $.x.response[500].text("Error!"); // ok
};
```

## Streaming responses (SSE, JSONL, JSON-seq)

Counterfact supports OpenAPI 3.2 sequential media types.  When your spec uses `itemSchema` on a `text/event-stream`, `application/jsonl`, or `application/json-seq` content type, the generated handler type expresses the body as `AsyncIterable<T>`.

Use `$.response[<status>].stream(iterable, contentType?)` to return a stream from any route handler.  The content type defaults to `"text/event-stream"`.

```ts
export const GET: HTTP_GET = async function* ($) {
  // generator-based SSE
  return $.response[200].stream(events());
};

async function* events() {
  yield { id: 1, message: "hello" };
  await new Promise((resolve) => setTimeout(resolve, 500));
  yield { id: 2, message: "world" };
}
```

Each item yielded by the iterable is serialised automatically:

| Content type           | Wire format per item         |
| ---------------------- | ---------------------------- |
| `text/event-stream`    | `data: <json>\n\n`           |
| `application/json-seq` | `\x1e<json>\n`               |
| JSONL / ndjson         | `<json>\n`                   |

For `text/event-stream` responses, Counterfact also sets `Cache-Control: no-cache` and `X-Accel-Buffering: no` automatically.

## See also

- [State](./state.md) — sharing state across routes with context objects
- [Middleware](./middleware.md) — cross-cutting request/response logic
- [Reference](../reference.md) — complete `$` parameter and response builder API reference
- [Usage](../usage.md)
