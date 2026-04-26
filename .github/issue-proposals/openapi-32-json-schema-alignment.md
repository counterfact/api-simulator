---
title: "OpenAPI 3.2: Verify json-schema-faker alignment with draft-bhutton-json-schema-01"
parentIssue: 1673
labels:
  - enhancement
  - openapi-3.2
assignees: []
milestone:
---

OpenAPI 3.2 updates its embedded JSON Schema reference to [draft-bhutton-json-schema-01](https://www.ietf.org/archive/id/draft-bhutton-json-schema-01.html) and [draft-bhutton-json-schema-validation-01](https://www.ietf.org/archive/id/draft-bhutton-json-schema-validation-01.html). The notable additions compared to earlier drafts include a revised `unevaluatedProperties`, `unevaluatedItems`, and `prefixItems`.

## Current state

Counterfact uses `json-schema-faker` to generate random values from schemas. The library's supported JSON Schema draft determines which keywords are available when generating mock data. It is unclear whether the current version of `json-schema-faker` supports all keywords in `draft-bhutton-json-schema-01`.

## Proposed changes

- Audit which `draft-bhutton-json-schema-01` keywords are used in practice and verify that `json-schema-faker` handles them correctly
- In particular, verify support for `prefixItems`, `unevaluatedItems`, and `unevaluatedProperties`
- If the current version of `json-schema-faker` does not support these keywords, upgrade the library or add workarounds (e.g. stripping unsupported keywords before passing the schema to the faker)
- Add tests using schemas that exercise the new keywords to confirm correct random value generation

## Acceptance criteria

- [ ] A schema using `prefixItems` generates random tuple values with correct types for each position
- [ ] A schema using `unevaluatedProperties: false` does not include extra properties in generated values
- [ ] A schema using `unevaluatedItems: false` does not include extra items in generated array values
- [ ] All existing random-generation tests continue to pass
- [ ] If `json-schema-faker` is upgraded, no regressions are introduced in existing mock response generation
