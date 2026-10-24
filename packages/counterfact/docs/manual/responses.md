# Response building and content negotiation

Use a custom response when a screen needs a specific body, status, header, or cookie. The generated types guide you toward values declared in the specification.

## Build a response

`$.response` is a fluent builder for HTTP responses. Start by picking a status code with `.status(code)`, then chain one or more methods. You can also supply headers and cookies before selecting a status; headers narrow the available statuses and satisfy required headers. See the [response builder reference](../api/responses.md) for typing details and migration from deprecated bracket selection.

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
return $.response
  .status(200)
  .header("x-request-id", "abc123")
  .json({ ok: true });
```

### Setting cookies

Use `.cookie(name, value, options?)` to set one or more cookies. Each call appends a new `Set-Cookie` header and returns the builder for chaining.

```ts
return $.response
  .status(200)
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
return $.response
  .status(200)
  .cookie("sessionId", "abc123")
  .cookie("theme", "dark")
  .json({ ok: true });
```

Supported options:

| Option     | Description                                   |
| ---------- | --------------------------------------------- |
| `path`     | Cookie path (e.g. `"/"`)                      |
| `domain`   | Cookie domain                                 |
| `maxAge`   | Max age in seconds (`Max-Age`)                |
| `expires`  | Expiry `Date` object (`Expires`)              |
| `httpOnly` | Sets the `HttpOnly` flag when `true`          |
| `secure`   | Sets the `Secure` flag when `true`            |
| `sameSite` | `"lax"`, `"strict"`, or `"none"` (`SameSite`) |

### Using named examples

If your OpenAPI spec defines named examples for a response, you can return a specific one by name using `.example()`. The name is autocompleted and type-checked — passing an unknown name is a compile error.

```ts
// Return a specific named example
return $.response.status(200).example("successResponse");

// Chain additional decorations after selecting an example
return $.response
  .status(200)
  .example("successResponse")
  .header("x-request-id", "abc123");
```

> [!TIP]
> Your IDE's autocomplete knows which status codes, headers, and response shapes are valid for each endpoint — based directly on your OpenAPI spec. If you omit a required header, TypeScript will tell you. When the spec changes and types are regenerated, TypeScript will surface any mismatches.

## Offer multiple representations

Chain `.match(contentType, content)` for explicit alternatives. The request’s `Accept` header selects a supported representation; unsupported media types can produce 406. Use `.empty()` for an intentionally bodyless response.

For all methods, see the [response builder reference](../api/responses.md).
