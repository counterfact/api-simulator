---
"counterfact": patch
---

generator: `ParametersTypeCoder` and `ParameterExportTypeCoder` now emit output under `types/<version>/paths/...`

`ParametersTypeCoder.modulePath()` and `ParameterExportTypeCoder.modulePath()` now insert the version segment between `types/` and the rest of the path when `this.version` is non-empty, matching the convention already used by `SchemaTypeCoder` and `ResponseTypeCoder`:

- `types/v1/paths/pets.parameters.ts` (versioned)
- `types/paths/pets.parameters.ts` (no version)

Single-spec (no version) generation produces identical output to before.
