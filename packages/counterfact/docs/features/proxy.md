# Proxy 🔀

You can mix real backend calls with mocks — useful when some endpoints are not finished or you need to test edge cases like 500 errors.

To proxy a single endpoint from within a route file:

```ts
// routes/pet/{petId}.ts
export const GET: HTTP_GET = ($) => {
  return $.proxy("https://uat.petstore.example.com/pet");
};
```

To set a proxy for the entire API at startup, pass `--proxy-url` on the CLI:

```sh
npx counterfact@latest openapi.yaml api --proxy-url https://uat.petstore.example.com
```

From the REPL, you can toggle proxying for the whole API or specific routes:

```
⬣> .proxy on /payments     # forward /payments to the real API
⬣> .proxy off /payments    # let Counterfact handle /payments
⬣> .proxy off              # stop proxying everything
```

Type `.proxy help` in the REPL for the full list of proxy commands.

## See also

- [Patterns: Hybrid Proxy](../patterns/hybrid-proxy.md) — when to mix real and mocked endpoints
- [REPL](./repl.md) — toggle proxying at runtime
- [Reference](../reference.md) — CLI flags
- [Usage](../usage.md)
