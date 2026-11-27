---
"@counterfact/generator": major
"@counterfact/runtime": major
"counterfact": major
---

Coalesce case-variant generated paths using the spelling that sorts first, independent of declaration order, while preserving CamelCase and exact OpenAPI URLs. Only routes that share a file use case-keyed method exports and route metadata; other routes keep the ordinary layout, and generated types share the canonical module. Generation migrates supported authored handlers and middleware with a backup and rejects ambiguous migrations.
