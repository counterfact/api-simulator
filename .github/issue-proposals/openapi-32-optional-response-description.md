---
title: "OpenAPI 3.2: Handle optional response description gracefully"
parentIssue: 1673
labels:
  - enhancement
  - openapi-3.2
assignees: []
milestone:
---

In OpenAPI 3.2, the `description` field on the Response Object is now optional (it was previously required). Counterfact should handle specs that omit `description` on one or more responses without errors or unexpected behaviour.

## Current state

The generator does not validate or use `description`. Missing descriptions are unlikely to cause an error in the current code, but this has not been explicitly verified with a test.

## Proposed changes

- Confirm in the test suite that an operation with responses that have no `description` is handled gracefully at both code-generation time and at runtime
- Add a regression test using a minimal spec that includes a response with no `description`

## Acceptance criteria

- [ ] A spec with a response that has no `description` is processed by the code generator without errors or warnings
- [ ] The generated TypeScript for such a spec passes `tsc --noEmit`
- [ ] A request to the mock server returns the expected status code and body even when the matched response has no `description`
- [ ] Existing specs with `description` present are unaffected
