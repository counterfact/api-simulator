---
"counterfact": minor
"@counterfact/generator": minor
---

Add options that change how schema types are declared in `types/` and the generated client's data contracts: `--enum-style <union|enum|const>` declares enums that name their members with `x-enumNames` or `x-enum-varnames` as TypeScript enums or const objects, `--ignore-nullable` omits `| null`, `--prefer-interfaces` declares named object schemas as interfaces, and `--validation-jsdoc` documents constraints such as `minLength` and `pattern` in JSDoc. They are also available as `counterfact.yaml` keys and as the `typeOptions` option of `CodeGenerator`. The defaults keep the current output.
