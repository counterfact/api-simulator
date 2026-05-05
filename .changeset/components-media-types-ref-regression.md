---
"counterfact": patch
---

Add regression tests confirming that `$ref` references to `#/components/mediaTypes/...` entries (OpenAPI 3.2) are resolved correctly during bundling and code generation.

- `specification.test.ts` now includes two tests: one that navigates to a `components/mediaTypes` entry via `getRequirement`, and one that verifies transparent `$ref` following through such an entry.
- `generate.test.ts` now includes two end-to-end tests: one that verifies code generation completes without error for a spec using a `$ref` to a media type component, and one that verifies the generated TypeScript types include the correct schema from the referenced media type.
