---
title: "OpenAPI 3.2: Add native QUERY HTTP method support"
parentIssue: 1673
labels:
  - enhancement
  - openapi-3.2
assignees: []
milestone:
---

OpenAPI 3.2 formally adds `QUERY` as a first-class HTTP method alongside `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`, `HEAD`, `PATCH`, and `TRACE`. The [QUERY method](https://www.ietf.org/archive/id/draft-ietf-httpbis-safe-method-w-body-02.html) is safe and idempotent but allows a request body, making it useful for complex search and filter operations.

## Current state

`HttpMethods` in `src/server/registry.ts` and `HTTP_METHODS` in `src/migrate/update-route-types.ts` do not include `QUERY`. The Koa layer, dispatcher, and migration helper would all need updating.

## Proposed changes

- Add `"query"` to `HttpMethods` in `src/server/registry.ts`
- Add `"QUERY"` to `ALL_HTTP_METHODS` (or equivalent) in `src/migrate/update-route-types.ts`
- Ensure the Koa middleware forwards `QUERY` requests to the matching handler
- Ensure the dispatcher routes `QUERY` requests correctly
- The code generator already iterates over all keys in a path definition, so generation should work automatically once the server recognises the method

## Acceptance criteria

- [ ] A `query` operation defined in an OpenAPI 3.2 spec generates a corresponding route handler file
- [ ] A `QUERY` HTTP request is routed to the correct handler and returns the expected response
- [ ] The migration helper recognises `QUERY` when updating existing route files
- [ ] Existing routes using other HTTP methods are unaffected
- [ ] Unit tests cover the new `QUERY` method in the registry, dispatcher, and migration helper
