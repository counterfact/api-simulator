---
"counterfact": minor
"@counterfact/runtime": minor
"@counterfact/generator": minor
"@counterfact/types": minor
---

Add synchronous `$.har()` lookup for recorded responses, with named predicate arguments (`request`, `entry`, `match`, and `defaultMatch`), deterministic matching, and live reload from each API project's `har/` directory. Return `undefined` on a miss so handlers can choose their own fallback.
