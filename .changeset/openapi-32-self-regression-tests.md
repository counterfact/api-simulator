---
'counterfact': patch
---

Add regression tests verifying that OpenAPI 3.2 `$self` document-identity field is preserved through bundling and that relative `$ref` values in specs with `$self` resolve correctly. Covers `Specification.fromFile()`, the OpenAPI middleware, and end-to-end code generation.
