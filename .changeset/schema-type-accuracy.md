---
"@counterfact/generator": patch
"counterfact": patch
---

Preserve nullable values, primitive constants, inferred object properties, referenced dictionary values, composition properties and required fields, explicit discriminator mappings, and tuple prefixes in generated TypeScript contracts. Keep unrestricted values typed as unknown and retain Counterfact's streaming and server-oriented binary types.

Regenerating contracts can expose existing handler type errors where required properties or literal constraints were previously lost.
