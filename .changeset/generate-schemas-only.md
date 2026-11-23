---
"counterfact": minor
"@counterfact/generator": minor
---

Add `--generate-schemas-only`, which writes only the schema types directly into the destination directory (`<destination>/[<group>/][<version>/]<Name>.ts`) without routes, scenarios, helper types, a cache, or a server. It requires an explicit destination and rejects conflicting flags, Swagger 2.0 documents, and schemas that depend on non-schema components. Config-file action options are ignored with a notice.

`CodeGenerator` gains `generateSchemas()` and `Repository` gains `writeSchemas()` for the same behavior.
