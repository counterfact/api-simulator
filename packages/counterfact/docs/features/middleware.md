# Middleware

Place a `_.middleware.ts` file in any `routes/` subdirectory to intercept requests and responses for that subtree. Middleware applies from the root down — a `_.middleware.ts` at the root runs for every request.

The `$` argument contains typed request data and the nearest authored context, as in a route handler. In this example, implement `isAuthorized(apiKey)` on that context; Counterfact supplies the parsed `$.auth` credentials. `respondTo($)` is the separate callback that continues request handling. See [function arguments](../manual/concepts.md#function-arguments).

```ts
// routes/_.middleware.ts
import type { Middleware } from "../types/_.middleware.js";

export const middleware: Middleware = async ($, respondTo) => {
  if (!$.context.isAuthorized($.auth?.apiKey)) {
    return $.response.status(401).json({ error: "Unauthorized" });
  }

  return respondTo($);
};
```

`respondTo($)` passes the request to the next middleware layer or the route handler, and returns the response. You can modify `$` before calling `respondTo`, modify the response after, or both.

Counterfact generates a `_.middleware.ts` type file for every directory in the routes tree. Import the matching type from the mirrored directory under `types/`. For example, `routes/admin/_.middleware.ts` imports `Middleware` from `types/admin/_.middleware.ts`. The generated type automatically uses the nearest `_.context.ts` file for `$.context`.

## Response headers, logging, and scoped middleware

The examples below use the generated type for the middleware directory. Declare the response statuses, bodies, and headers your contract expects.

### Adding response headers

Attach headers to every response in a subtree — useful for simulating CORS, rate-limit headers, or tracing identifiers:

```ts
// routes/_.middleware.ts
import { randomUUID } from "node:crypto";
import type { Middleware } from "../types/_.middleware.js";

export const middleware: Middleware = async ($, respondTo) => {
  const response = await respondTo($);
  return {
    ...response,
    headers: {
      ...("headers" in response ? response.headers : {}),
      "x-ratelimit-limit": "1000",
      "x-ratelimit-remaining": "999",
      "x-request-id": randomUUID(),
    },
  };
};
```

### Request logging

Log each matched route and its response status without touching any handler:

```ts
// routes/_.middleware.ts
import type { Middleware } from "../types/_.middleware.js";

export const middleware: Middleware = async ($, respondTo) => {
  const start = Date.now();
  const response = await respondTo($);
  const elapsed = Date.now() - start;
  const status = "status" in response ? response.status : undefined;
  console.log(`${$.matchedPath} → ${status ?? "default"} (${elapsed}ms)`);
  return response;
};
```

### Scoped middleware

Apply middleware only to a specific domain. The `_.middleware.ts` under `routes/admin/` fires for admin routes only; all other routes are unaffected:

```ts
// routes/admin/_.middleware.ts
import type { Middleware } from "../../types/admin/_.middleware.js";

export const middleware: Middleware = async ($, respondTo) => {
  const token = $.headers["x-admin-token"];
  if (token !== "super-secret") {
    return $.response.status(403).text("Forbidden");
  }
  return respondTo($);
};
```

## See also

- [Routes](./routes.md)
- [Reference](../api.md)
- [Find your workflow](../usage.md)
