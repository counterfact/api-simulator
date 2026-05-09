---
"counterfact": patch
---

Prefer `dataValue` over `value` in OpenAPI 3.2 Example Objects

When building example responses, Counterfact now checks for the `dataValue`
field (introduced in OpenAPI 3.2) and uses it in preference to the existing
`value` field. If `dataValue` is absent, the existing `value` field is used as
before, maintaining full backward compatibility with OpenAPI 3.0 and 3.1 specs.
