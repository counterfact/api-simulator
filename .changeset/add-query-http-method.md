---
"counterfact": minor
---

Add native support for the `QUERY` HTTP method (OpenAPI 3.2). The `QUERY` method is safe and idempotent but allows a request body, making it useful for complex search and filter operations.

- `HttpMethods` in `src/server/registry.ts` now includes `"QUERY"`.
- The `Module` interface exposes a `QUERY` handler that receives a request body.
- `HTTP_METHODS` in `src/migrate/update-route-types.ts` now includes `"QUERY"` so the migration helper recognises `HTTP_QUERY` type imports.
- The MSW integration's `allowedMethods` list now includes `"query"`.
- The Koa middleware already passes the request body for any method that is not `GET` or `HEAD`, so `QUERY` requests forward their body to the handler automatically.
