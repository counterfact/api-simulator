---
"@counterfact/generator": minor
"counterfact": minor
"@counterfact/tutorials": patch
---

Generate a central `types/index.ts` exporting `Routes`, `Components`, and `Schemas` (an alias of `Components["schemas"]`). Include unused components, preserve lowercase OpenAPI categories, and use indexed `Routes` contracts in new route handlers while preserving existing route edits and deep imports.

Deprecate deep imports of generated operation and component types. Use the central exports throughout the manual, API reference, homepage, walkthrough, and agent guidance.
