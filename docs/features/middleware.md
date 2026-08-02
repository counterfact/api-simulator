# Middleware

Place a `_.middleware.ts` file in any `routes/` subdirectory to intercept requests and responses for that subtree. Middleware applies from the root down — a `_.middleware.ts` at the root runs for every request.

```ts
// routes/_.middleware.ts
import type { Middleware } from "../types/_.middleware.js";

export const middleware: Middleware = async ($, respondTo) => {
  if (!$.context.isAuthorized($.auth?.apiKey)) {
    return $.response[401].json({ error: "Unauthorized" });
  }

  return respondTo($);
};
```

`respondTo($)` passes the request to the next middleware layer or the route handler, and returns the response. You can modify `$` before calling `respondTo`, modify the response after, or both.

Counterfact generates a `_.middleware.ts` type file for every directory in the routes tree. Import the matching type from the mirrored directory under `types/`. For example, `routes/admin/_.middleware.ts` imports `Middleware` from `types/admin/_.middleware.ts`. The generated type automatically uses the nearest `_.context.ts` file for `$.context`.

## See also

- [Patterns: Custom Middleware](../patterns/custom-middleware.md) — authentication, headers, and logging across route groups
- [Routes](./routes.md)
- [Reference](../reference.md)
- [Usage](../usage.md)
