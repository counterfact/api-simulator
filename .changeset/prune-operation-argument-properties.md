---
"@counterfact/generator": patch
"counterfact": patch
---

Emit operation argument types as plain object types, omitting unavailable request inputs during generation instead of wrapping them in `OmitValueWhenNever`. Apply the same pruning to versioned operation arguments.
