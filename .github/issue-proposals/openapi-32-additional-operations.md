---
title: "OpenAPI 3.2: Support additionalOperations for arbitrary HTTP methods"
parentIssue: 1673
labels:
  - enhancement
  - openapi-3.2
assignees: []
milestone:
---

OpenAPI 3.2 introduces an `additionalOperations` key on the Path Item Object for HTTP methods that do not have a dedicated field (e.g. `LINK`, `UNLINK`, `LOCK`). Values are Operation Objects keyed by the method name in its correct capitalisation.

## Current state

The generator in `src/typescript-generator/generate.ts` iterates over all top-level keys in each path item, so keys like `get`, `post`, etc. are processed automatically. However, `additionalOperations` is a *nested* object and would not be unwrapped by the current loop; those operations would be silently ignored.

## Proposed changes

- Detect the `additionalOperations` key during code generation in `src/typescript-generator/generate.ts` and flatten its entries into the same processing loop as standard methods
- Update the Koa middleware and/or dispatcher to forward requests with custom method names to the matching handler
- Update `src/server/registry.ts` to accept and store handlers for arbitrary method names

## Acceptance criteria

- [ ] An operation defined under `additionalOperations` (e.g. `LINK`) in an OpenAPI 3.2 spec generates a corresponding route handler file
- [ ] A request using an arbitrary HTTP method (e.g. `LINK`) is routed to the correct handler and returns the expected response
- [ ] Standard method operations (`get`, `post`, etc.) continue to be generated and routed correctly
- [ ] A test covers code generation for an `additionalOperations` entry
- [ ] A test covers end-to-end routing for a custom HTTP method
