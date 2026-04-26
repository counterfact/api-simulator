---
title: "OpenAPI 3.2: Prefer dataValue and serializedValue in example responses"
parentIssue: 1673
labels:
  - enhancement
  - openapi-3.2
assignees: []
milestone:
---

OpenAPI 3.2 adds two new fields to the Example Object:

- `dataValue` — the example expressed as a structured (parsed) value, analogous to the existing `value` field.
- `serializedValue` — the example as it would appear on the wire, as a string.

The existing `externalValue` is now explicitly documented as a serialized value.

## Current state

Counterfact's random-response logic reads the `value` field from Example Objects when returning example responses. The new `dataValue` and `serializedValue` fields are not recognised.

## Proposed changes

- When selecting an example response, prefer `dataValue` over `value` so that structured data is used correctly (update the response-building / example-selection logic, likely in the server dispatcher or response helper)
- Optionally support `serializedValue` for content types where the wire format differs from the parsed form (e.g. `application/x-www-form-urlencoded`)
- Ensure backward compatibility: fall back to `value` when `dataValue` is absent

## Acceptance criteria

- [ ] An example with `dataValue` is returned as the response body in preference to `value`
- [ ] An example with only `value` (and no `dataValue`) continues to be returned correctly
- [ ] `serializedValue` is returned verbatim as the response body for appropriate content types
- [ ] Existing behaviour for specs that do not use `dataValue` or `serializedValue` is unchanged
- [ ] A unit test covers each of the three cases: `dataValue` present, `value`-only, and `serializedValue`
