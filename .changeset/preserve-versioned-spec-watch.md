---
"counterfact": patch
"@counterfact/generator": patch
---

Preserve all versions in shared handler types when a watched OpenAPI specification changes. Regenerate the complete API group in declaration order so version guards retain the older branch and removed operations leave the version map.
