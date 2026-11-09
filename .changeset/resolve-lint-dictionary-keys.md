---
"@counterfact/client": patch
"@counterfact/runtime": patch
"@counterfact/repl": patch
---

Handle prototype-named cookie/query inputs as ordinary own data properties, preserve unchanged context initializers containing an own `__proto__` key, and ignore inherited names when completing scenario groups.
