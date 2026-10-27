---
"@counterfact/tutorials": minor
"counterfact": patch
---

Rebuild the coffee-shop walkthrough as twelve lessons that start with Counterfact’s actual generated random stubs. Render arbitrary products, refresh only on explicit actions, and show actual HTTP requests and responses. Explicit step preparation supplies supporting code while learners connect behavior through small edits. Context and helpers import generated schema types. The conversation shows attributed line diffs for Milo’s approved edits and the learner’s saved changes. A local snapshot journal replaces automatic Git initialization and commits.

Present lessons as a conversation with Milo, a coffee-shop owner and tutor. Explain the shared editing workflow and in-chat diffs in the opening turn. The tutor describes edits before the learner approves them, and both sides of the conversation stay visible across reloads. Reveal instructions progressively, check the inventory question before revealing its exercise, and reveal the next lesson when the learner replies after completing the current exercise. Version new lesson progress and telemetry while retaining helper compatibility for existing generated demos.

Record explicit shop actions and their observed results in the conversation, including product refreshes, cart edits, order attempts, failures, and retries. Preserve these turns across reloads without turning automatic requests into learner actions.

Attach collapsed HTTP request/response snapshots to refresh, order, and retry turns, including handler-file links. Retain each exchange across later actions and reloads, and keep malformed or missing responses visible for diagnosis.
