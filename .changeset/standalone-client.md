---
"counterfact": minor
"@counterfact/generator": minor
---

Add `--generate-client-only` (`generateClientOnly` in `counterfact.yaml`), which writes a standalone API client to `client/` and nothing else: no routes, scenarios, `types/`, `counterfact-types/` or `.cache`. The client declares its own request and response types, and every schema gets its own file under `client/data-contracts/`, re-exported by `client/data-contracts.ts`. The client naming options and schema type options apply. Programmatically, use `CodeGenerator#generateClientOnly()` or the `standalone` client option.
