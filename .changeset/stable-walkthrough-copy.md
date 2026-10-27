---
"@counterfact/tutorials": minor
"counterfact": patch
---

Rebuild the coffee-shop walkthrough as twelve lessons that start with Counterfact’s actual generated random stubs. Render arbitrary products, refresh only on explicit actions, and show actual HTTP requests and responses. Explicit step preparation supplies supporting code while learners connect behavior through small edits. Context and helpers import generated schema types. Each new demo has a local Git repository, a generated baseline commit, and a checkpoint after every lesson so the IDE shows the current changes.

Present lessons as a conversation with Milo, a coffee-shop owner and tutor. Explain the shared editing workflow and Git in the opening turn. The tutor describes edits before the learner approves them, and both sides of the conversation stay visible across reloads. Reveal instructions progressively, check the inventory question before revealing its exercise, and reveal the next lesson when the learner replies after completing the current exercise. Version new lesson progress and telemetry while retaining helper compatibility for existing generated demos.
