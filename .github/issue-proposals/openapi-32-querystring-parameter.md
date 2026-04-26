---
title: "OpenAPI 3.2: Support querystring parameter location"
parentIssue: 1673
labels:
  - enhancement
  - openapi-3.2
assignees: []
milestone:
---

OpenAPI 3.2 adds `querystring` as a new value for the `in` field of a Parameter Object. Unlike the existing `query` (which targets a single named query parameter), `querystring` treats the entire query string as a single field and allows it to be parsed with a schema, similar to how `requestBody` works for request bodies. This simplifies complex query-string APIs such as OData or OpenSearch.

## Current state

`src/typescript-generator/parameters-type-coder.ts` generates typed objects for `query`, `path`, `header`, and `cookie` parameters. A `querystring` parameter would currently be silently ignored, and the dispatcher's parameter-extraction logic does not handle it.

## Proposed changes

- Handle `in: querystring` in `ParametersTypeCoder` (`src/typescript-generator/parameters-type-coder.ts`) to generate a typed `querystring` property on the `$` argument
- Update the dispatcher's parameter-extraction logic (`src/server/dispatcher.ts`) to parse the raw query string against the schema and populate `$.querystring`
- Ensure the generated TypeScript type for `$.querystring` reflects the schema defined in the parameter object

## Acceptance criteria

- [ ] A parameter with `in: querystring` generates a `querystring` property on the typed `$` argument
- [ ] The generated TypeScript passes `tsc --noEmit` without errors
- [ ] At runtime, `$.querystring` contains the parsed query string matching the defined schema
- [ ] Existing `query`, `path`, `header`, and `cookie` parameters are unaffected
- [ ] Unit tests cover type generation and runtime extraction for `querystring` parameters
