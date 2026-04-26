---
title: "OpenAPI 3.2: Support XML nodeType field in JSON-to-XML serialisation"
parentIssue: 1673
labels:
  - enhancement
  - openapi-3.2
assignees: []
milestone:
---

OpenAPI 3.2 adds a `nodeType` field to the XML Object. This field maps a schema to a specific XML node type: `element`, `attribute`, `text`, `cdata`, or `none`. The existing `attribute: true` is deprecated in favour of `nodeType: attribute`, and `wrapped: true` is deprecated in favour of `nodeType: element`.

## Current state

`src/server/json-to-xml.ts` handles XML serialisation based on the XML Object, but it is unclear how fully the existing `attribute` and `wrapped` flags are supported. The new `nodeType` field is not recognised.

## Proposed changes

- Update `json-to-xml.ts` to understand the `nodeType` field and map each value (`element`, `attribute`, `text`, `cdata`, `none`) to the correct XML serialisation behaviour
- Treat the deprecated `attribute: true` as a synonym for `nodeType: attribute` during the transition period
- Treat the deprecated `wrapped: true` as a synonym for `nodeType: element` during the transition period

## Acceptance criteria

- [ ] A schema with `xml.nodeType: attribute` serialises its value as an XML attribute
- [ ] A schema with `xml.nodeType: text` serialises its value as an XML text node
- [ ] A schema with `xml.nodeType: cdata` serialises its value as a CDATA section
- [ ] A schema with `xml.nodeType: none` is omitted from the XML output
- [ ] The deprecated `xml.attribute: true` continues to produce the same output as `xml.nodeType: attribute`
- [ ] The deprecated `xml.wrapped: true` continues to produce the same output as `xml.nodeType: element`
- [ ] Existing XML serialisation for schemas without `nodeType` is unaffected
