---
"counterfact": patch
"@counterfact/tutorials": minor
---

Extract guided learning experiences into `@counterfact/tutorials`, starting with the coffee-shop tour. Keep the existing offline first-run experience while moving tour content, presentation, progression, saved-handler checks, and project preparation out of the CLI package. Future tours share this package; the CLI retains startup and terminal interactions.

Format the walkthrough's generated TypeScript files with Prettier, including the editable product, order, context, and scenario files.
