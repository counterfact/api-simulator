# HTTP Admin API

Use the Admin API when an external tool needs to inspect the running simulator or change a context or proxy setting over HTTP.

## Enable and inspect

```sh
npx counterfact ./openapi.yaml api --admin-api
curl http://localhost:3100/_counterfact/api/health
curl http://localhost:3100/_counterfact/api/routes
curl http://localhost:3100/_counterfact/api/contexts
```

The Admin API is disabled by default. Without a token it accepts only loopback clients. Configure `--admin-api-token` or `COUNTERFACT_ADMIN_API_TOKEN` and send a Bearer token when you need authenticated access.

## Change a context subtree

For a `/pets` context with an `unavailable` field:

```sh
curl -X POST http://localhost:3100/_counterfact/api/contexts/pets \
  -H 'Content-Type: application/json' \
  -d '{"unavailable": true}'
```

The update goes through the context registry. Read the context back and send an ordinary API request to observe the behavior. The bare `/contexts` endpoint lists contexts; it does not update the root context.

## Choose the right control surface

Use the REPL for interactive access to context methods. Use the library for awaited reset and scenario operations in a test suite; the Admin API does not expose those lifecycle methods. For endpoint schemas, response envelopes, and authentication errors, see the [HTTP Admin API reference](../api/admin-api.md).
