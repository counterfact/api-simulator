---
title: "OpenAPI 3.2: Set name field on injected Counterfact server entry"
parentIssue: 1673
labels:
  - enhancement
  - openapi-3.2
assignees: []
milestone:
---

OpenAPI 3.2 adds a `name` field to the Server Object alongside the existing `description`, `url`, and `variables` fields. Tools that display server lists (including OpenAPI 3.2-aware UIs like Swagger UI) may use `name` as the primary label for a server entry.

## Current state

`src/server/openapi-middleware.ts` injects a `Counterfact` server entry into the spec with only `description` and `url` fields. The `name` field is not set.

## Proposed changes

- Set `name: "Counterfact"` in the injected server entry in `src/server/openapi-middleware.ts`

## Acceptance criteria

- [ ] The injected server entry in the served OpenAPI spec includes `name: "Counterfact"`
- [ ] The `description` and `url` fields on the injected entry are unchanged
- [ ] Tools that display the server list (e.g. the built-in Swagger UI) show "Counterfact" as the server name
- [ ] A unit or integration test confirms that the injected server object includes the `name` field
