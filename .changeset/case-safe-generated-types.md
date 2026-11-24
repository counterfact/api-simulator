---
"counterfact": patch
"@counterfact/generator": patch
---

Write generated type files to paths that stay distinct on case-insensitive file systems (the default on macOS and Windows). OpenAPI names are case-sensitive, so a spec with schemas named `OutputType` and `OutPutType`, or with paths `/Companies` and `/companies/{id}`, used to produce files that overwrote each other or directories with mixed spellings, and TypeScript reported "differs from already included file name only in casing". Directories that differ only by case are now merged under one spelling, and files that differ only by case get a numeric suffix (`OutputType_2.ts`). The same applies to `--generate-schemas`. Paths without a case-insensitive twin are unchanged, and route files keep their paths because the runtime maps them to URLs.

On a case-insensitive file system, delete the generated `types/` directory once after upgrading so that spellings left by earlier runs are replaced.
