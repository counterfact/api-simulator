# REPL and HTTP client

An [API group](../manual/concepts.md#api-groups-versions-and-url-prefixes) is the configured name of specs sharing code and state. The grouped bindings below use that name.

The terminal REPL evaluates JavaScript against the running simulator. Start it from the CLI or call `api.startRepl()`.

| Binding or command          | Purpose                                                                          |
| --------------------------- | -------------------------------------------------------------------------------- |
| `context`                   | Root context, or contexts keyed by API group.                                    |
| `loadContext(path)`         | Read a nested context; use `loadContext.group(path)` for multiple APIs.          |
| `store`                     | Live application store, when one exists.                                         |
| `routes`                    | Loaded routes, grouped for multiple APIs.                                        |
| `client`                    | Raw HTTP client supporting standard HTTP methods.                                |
| `route(path)`               | Immutable OpenAPI-aware request builder; grouped by API group for multiple APIs. |
| `.scenario`                 | List available scenarios.                                                        |
| `.scenario module/function` | Execute a named scenario.                                                        |

## Request builder methods

| Method             | Result                                                     |
| ------------------ | ---------------------------------------------------------- |
| `.method(method)`  | Select the HTTP method.                                    |
| `.path(values)`    | Set path parameters.                                       |
| `.query(values)`   | Set query parameters.                                      |
| `.headers(values)` | Set request headers.                                       |
| `.cookies(values)` | Set cookie parameters.                                     |
| `.form(values)`    | Set text form fields (URL-encoded or text-only multipart). |
| `.body(value)`     | Set the request body.                                      |
| `.ready()`         | Report whether required parameters are supplied.           |
| `.missing()`       | List missing required parameters.                          |
| `.help()`          | Describe the selected OpenAPI operation.                   |
| `.send()`          | Send the request.                                          |

Builder configuration methods return new builders, so requests can be reused and branched. Required-parameter checks are a preparation aid, not a replacement for server validation. See [request builder](../features/route-builder.md) for examples and response handling.

## Standalone client

Import `createOpenApiRouteCatalog` and `createRouteFunction` from `@counterfact/client` to use the builder outside the REPL. See [public packages](./packages.md).

## Chaos API (HTTP-layer fault injection)

The Live REPL exposes `chaos(pathPrefix?)` for changing simulated HTTP
responses without editing route handlers. The registry is shared by every API
group in one Counterfact simulator.

Prefixes match both the incoming URL pathname and the route-relative pathname
after removing the configured API prefix and OpenAPI `basePath`. For example,
`chaos("/billing/orders").delay(1_000)` targets `/billing/orders`, while
`chaos("/orders").delay(1_000)` also matches `/inventory/orders` when those
APIs use `/billing` and `/inventory` prefixes. Query strings are not matched.

```ts
const fault = chaos("/orders")
  .next(3)
  .probability(0.5)
  .status(503)
  .delay(1_000)
  .header("Retry-After", "1")
  .transformBody((body) => ({ body, degraded: true }));

fault.stop();
fault.start();
```

`chaos()` with no prefix matches every request. A new rule is active
indefinitely; use `next()` or `next(count)` to bound how many successful rule
applications it consumes. A stopped rule or a request skipped by
`probability(...)` does not consume that count. Probability must be a finite
number from `0` through `1`, otherwise Counterfact throws a `RangeError`.

Available mutations are `status(code)`, `delay(ms)`, `header(name, value)`,
`removeHeader(name)`, `body(value)`, and `transformBody(fn)`. Header names are
matched case-insensitively and the last mutation for a header wins.
`Content-Type` is protected because Counterfact owns response serialization.
Likewise, the last call to `body()` or `transformBody()` wins.
Response validation warnings remain attached when a rule applies, including
when it delays the response.

When several active rules match, exactly one applies: the longest path prefix
wins, then the most recently configured rule. There is no `always()` method
because indefinite application is already the default, and no `timeout()`
method because chaos rules model HTTP responses rather than network
disconnects.

---

