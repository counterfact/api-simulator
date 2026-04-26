---
title: "OpenAPI 3.2: Support OAuth2 Device Authorization flow in generated handler types"
parentIssue: 1673
labels:
  - enhancement
  - openapi-3.2
assignees: []
milestone:
---

OpenAPI 3.2 adds a `deviceAuthorization` entry to the OAuth2 Security Scheme Flows Object, with a `deviceAuthorizationUrl` field per [RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628). This flow is commonly used for CLI tools, smart TVs, and other input-constrained devices.

## Current state

`OperationTypeCoder` in `src/typescript-generator/operation-type-coder.ts` checks for `type === "http" && scheme === "basic"` to determine the `user` type on the `$` argument. Other flows, including `deviceAuthorization`, are not specially handled.

## Proposed changes

- Recognise the `deviceAuthorization` flow in `OperationTypeCoder`
- Generate the correct credential shape (device-flow tokens) on the `$` argument for operations secured by the device authorisation flow

## Acceptance criteria

- [ ] An operation secured by an OAuth2 `deviceAuthorization` flow generates a `$` argument with the correct device-flow credential type
- [ ] The generated TypeScript passes `tsc --noEmit` without errors
- [ ] Existing operations secured by other OAuth2 flows or HTTP basic auth continue to generate correct types
- [ ] A unit test covers type generation for an operation using the device authorization flow
