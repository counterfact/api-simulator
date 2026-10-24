# Proxying and hybrid simulation

You can mix real backend calls with mocks — useful when some endpoints are not finished or you need to test edge cases like 500 errors.

To proxy a single endpoint from within a route file:

```ts
// routes/pet/{petId}.ts
export const GET: HTTP_GET = function ($) {
  return $.proxy(
    `https://uat.petstore.example.com/pet/${encodeURIComponent(String($.path.petId))}`,
  );
};
```

`$.proxy(targetUrl)` forwards to the explicit URL. In the standard HTTP server, the helper does not automatically preserve the incoming path or query string. Include the upstream operation path, encoded path parameters, and any query parameters that the operation needs. The example maps `/pet/123` to the upstream `/pet/123` explicitly.

It forwards the method, incoming headers (except `Host`), and raw body. Route-level forwarding passes through local request and supported response checks; it differs from configuration-selected proxying, which bypasses local dispatch. See the [proxy API contract](../api/handlers.md#forward-a-request-with-proxytargeturl).

To set a proxy for the entire API at startup, pass `--proxy-url` on the CLI:

```sh
npx counterfact@latest openapi.yaml api --proxy-url https://uat.petstore.example.com
```

From the REPL, you can toggle proxying for the whole API or specific routes:

```
⬣> .proxy on /payments     # forward /payments to the real API
⬣> .proxy off /payments    # let Counterfact handle /payments
⬣> .proxy off              # disable the root proxy default
```

The REPL toggles use the upstream configured by `--proxy-url` or `.proxy url <url>`.
A path toggle applies to that path and its descendants unless a more specific
toggle overrides it. `.proxy off` changes only the root default; existing
path-specific `on` overrides remain active.

Type `.proxy help` in the REPL for the full list of proxy commands.

## See also

- [Patterns: Hybrid Proxy](../patterns/hybrid-proxy.md) — when to mix real and mocked endpoints
- [REPL](./repl.md) — toggle proxying at runtime
- [Reference](../api.md) — CLI flags
- [Find your workflow](../usage.md)
