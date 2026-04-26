---
title: "OpenAPI 3.2: Surface response summary in the API testing UI"
parentIssue: 1673
labels:
  - enhancement
  - openapi-3.2
assignees: []
milestone:
---

OpenAPI 3.2 adds a `summary` field to the Response Object alongside the existing `description`. This short label can be surfaced in API tooling to help developers quickly identify available response codes.

## Current state

The built-in API-testing GUI (`src/client/api-tester.html.hbs`) lists available response codes but does not display any summary or description text.

## Proposed changes

- In `src/client/api-tester.html.hbs`, read the `summary` field from each Response Object in the spec
- Display `summary` as a tooltip or inline label next to each response code when it is present
- Fall back gracefully when `summary` is absent

## Acceptance criteria

- [ ] A response code with a `summary` field shows the summary text as a tooltip or label in the API testing UI
- [ ] A response code without `summary` displays without error (no regression)
- [ ] The UI remains usable and readable when multiple response codes are listed
- [ ] The change does not affect server behaviour — only the UI rendering
