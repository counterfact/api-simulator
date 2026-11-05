---
"@counterfact/runtime": patch
---

Stop request-body validation at the first failure instead of collecting errors for every invalid field or item, avoiding excessive error allocation from malformed input.
