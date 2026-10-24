# Handler arguments

Export one function per HTTP method from a file under `routes/`. The generated `HTTP_GET`, `HTTP_POST`, and related types describe that operation. A handler receives one `$` argument.

Operation and parameter types use stable HTTP method names: for example, `HTTP_GET`, `HTTP_POST`, and
`HTTP_GET_Query`, `HTTP_GET_Path`, `HTTP_GET_Headers`, or `HTTP_GET_Cookie`
when those parameters exist.

On CLI startup, Counterfact automatically migrates route imports and references
from the previous generated names to these method-based names. It
preserves handler logic, comments, strings, and explicit import aliases. Imports
outside the route's generated type module are left alone. If you reference the
old generated names outside your routes, update those references manually.

| Property        | Type               | Description                                                                             |
| --------------- | ------------------ | --------------------------------------------------------------------------------------- |
| `$.path`        | typed object       | Path parameters from the URL                                                            |
| `$.query`       | typed object       | Query string parameters                                                                 |
| `$.querystring` | typed object       | Entire query string as a single typed object (OpenAPI 3.2 `in: querystring` parameters) |
| `$.headers`     | typed object       | Request headers                                                                         |
| `$.body`        | typed object       | Parsed request body                                                                     |
| `$.context`     | `Context` instance | Shared state for this route subtree                                                     |
| `$.response.status(N)` | response builder   | Fluent builder for HTTP status code N (e.g. `$.response.status(200)`, `$.response.status(404)`)       |

| Member                | Contract                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `$.auth`              | Parsed Basic credentials and supported API-key credentials. This exposes credentials; handlers or middleware implement authorization.  |
| `$.delay(ms, maxMs?)` | Await a fixed delay or a random delay in the supplied range, in milliseconds.                                                          |
| `$.x`                 | The handler argument with widened types, for intentionally out-of-contract behavior. Runtime validation remains separately configured. |

## Forward a request with `$.proxy(targetUrl)`

`$.proxy(targetUrl: string)` returns a promise of a response object containing `status`, `headers`, `contentType`, and the upstream body as text. Return or await it from a handler. It forwards the incoming HTTP method, headers (with `Host` removed), and raw body.

Use an explicit target URL including the operation path and any query string. In the standard HTTP server, the helper does not append the incoming path or query. For example, `$.proxy("http://localhost:9000/users")` forwards to `/users`; using only `http://localhost:9000` sends to the root. Encode path values when constructing a target from request parameters.

Route-level `$.proxy()` runs after local request validation and its returned response passes through local content negotiation and supported response-header validation. In contrast, forwarding selected by the global/path proxy configuration happens before local dispatch and bypasses those checks. Neither path performs general response-body schema validation. See [hybrid proxying](../patterns/hybrid-proxy.md).

See [custom route handlers](../features/routes.md) for request serialization and authentication examples, and [response builders](./responses.md) for return values.
