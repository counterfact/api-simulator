---
"@counterfact/runtime": patch
"counterfact": patch
---

Preserve live object and array context state when unchanged declarations reload. Scenario-seeded inventory, request updates, and REPL edits now survive context reloads; deliberately changed initializers still apply.
