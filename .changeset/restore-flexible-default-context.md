---
"@counterfact/generator": patch
"counterfact": patch
---

Restore the string index signature in the generated default Context class so handlers can add shared state immediately. Remove the index signature to opt into strict typing; existing context files are preserved during regeneration.
