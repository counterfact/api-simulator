# Handler arguments

Export one function per HTTP method from a file under `routes/`. Import `Routes`
from the generated `types/index.js` entry point and define a local `Route` alias for the slash-prefixed path segments. Select the
uppercase method from that alias:

```ts
// api/routes/pet/{petId}.ts
import type { Routes } from "../../types/index.js";

type Route = Routes["/pet"]["/{petId}"];

export const GET: Route["GET"] = function ($) {
  return $.response.status(200).random();
};
```

A handler receives one `$` argument. Its type includes the request inputs,
response builders, and nearest context. To name an input type outside a handler,
derive it from the same contract:

```ts
import type { Routes } from "./api/types/index.js";

type Route = Routes["/pet"]["/{petId}"];

type GetPet = Route["GET"];
type GetPetPath = Parameters<GetPet>[0]["path"];
```

Use `Schemas["Pet"]` or `Components["schemas"]["Pet"]` for named schemas; both
are exported by the same entry point. See [central type exports](../features/generated-code.md#central-type-exports).

Direct imports from generated operation and component modules are deprecated.
Existing imports continue to work, and regeneration preserves existing handlers;
update their imports and annotations explicitly when adopting the central maps.
The startup migration for older operationId-based names remains a compatibility
step; it does not migrate deep imports to `Routes` automatically.

| Property               | Type               | Description                                                                                     |
| ---------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| `$.path`               | typed object       | Path parameters from the URL                                                                    |
| `$.query`              | typed object       | Query string parameters                                                                         |
| `$.querystring`        | typed object       | Entire query string as a single typed object (OpenAPI 3.2 `in: querystring` parameters)         |
| `$.headers`            | typed object       | Request headers                                                                                 |
| `$.body`               | typed object       | Parsed request body                                                                             |
| `$.context`            | `Context` instance | Shared state for this route subtree                                                             |
| `$.response.status(N)` | response builder   | Fluent builder for HTTP status code N (e.g. `$.response.status(200)`, `$.response.status(404)`) |

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
