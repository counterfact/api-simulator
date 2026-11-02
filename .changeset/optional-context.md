---
"@counterfact/generator": minor
"counterfact": minor
"@counterfact/runtime": patch
---

Make route context files optional. New simulations use a shared empty context typed as `Record<string, any>` without scaffolding `routes/_.context.ts`. Adding a context class restores strict typing, including inherited contexts, and context-file watching updates route types without regenerating handlers.
