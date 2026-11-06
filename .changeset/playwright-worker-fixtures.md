---
"@counterfact/playwright": minor
---

Add a Playwright Test adapter with worker-isolated Counterfact servers and API
source copies, OS-assigned ports, awaited automatic per-test reset, optional
scenario selection, direct simulator access, and composition with existing
extended tests. Keep Playwright dependencies outside Counterfact core.

Preserve ancestor dependency lookup and package module scopes when isolating API
sources, including mixed local/hoisted imports and JavaScript ESM scenarios.
