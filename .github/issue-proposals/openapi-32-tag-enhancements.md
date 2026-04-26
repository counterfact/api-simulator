---
title: "OpenAPI 3.2: Support tag summary, parent, and kind fields in the dashboard"
parentIssue: 1673
labels:
  - enhancement
  - openapi-3.2
assignees: []
milestone:
---

OpenAPI 3.2 adds three new fields to the Tag Object:

- `summary` — a short title for the tag, used in lists.
- `parent` — points to a parent tag to support nested grouping.
- `kind` — classifies the tag (e.g. `nav`, `audience`) per the [public registry](https://spec.openapis.org/registry/tag-kind/index.html).

## Current state

Counterfact does not currently process or display tag metadata beyond the tag name. The built-in dashboard and API-testing GUI (`src/client/`) list operations without hierarchical grouping.

## Proposed changes

- Update the built-in dashboard / API-testing GUI (`src/client/` Handlebars/Vue templates) to read `summary`, `parent`, and `kind` from each Tag Object in the spec
- Render a hierarchical navigation tree that groups operations by nested tags using the `parent` field
- Use `summary` as the display label for a tag when available, falling back to `name`
- Optionally filter or badge tags by `kind` (e.g. show only `nav` tags in the sidebar)

## Acceptance criteria

- [ ] An API with nested tags (using `parent`) renders a hierarchical navigation tree in the dashboard
- [ ] `summary` is shown as the tag label when present; `name` is used as the fallback
- [ ] Tags without `parent`, `summary`, or `kind` display correctly (no regression)
- [ ] A large API with many nested tags remains navigable and readable in the dashboard
