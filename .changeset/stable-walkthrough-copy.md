---
"@counterfact/tutorials": minor
"counterfact": patch
---

Rebuild the coffee-shop walkthrough as thirteen lessons that start with Counterfact’s actual generated random stubs. Render arbitrary products, refresh only on explicit actions, and show actual HTTP requests and responses. Explicit step preparation supplies supporting code while learners connect behavior through small edits. Context and helpers import generated schema types. The conversation shows attributed line diffs for Milo’s approved edits and the learner’s saved changes. A local snapshot journal replaces automatic Git initialization and commits.

Present lessons as a conversation with Milo, a coffee-shop owner and tutor. Explain the shared editing workflow and in-chat diffs in the opening turn. The tutor describes edits before the learner approves them, and both sides of the conversation stay visible across reloads. Reveal instructions progressively, check the inventory question before revealing its exercise, and reveal the next lesson when the learner replies after completing the current exercise. Version new lesson progress and telemetry while retaining helper compatibility for existing generated demos.

Record explicit shop actions and their observed results in the conversation, including product refreshes, cart edits, order attempts, failures, and retries. Preserve these turns across reloads without turning automatic requests into learner actions.

Attach collapsed HTTP request/response snapshots to refresh, order, and retry turns, including handler-file links. Retain each exchange across later actions and reloads, and keep malformed or missing responses visible for diagnosis.

Include submitted REPL input as learner turns alongside file edits and shop actions. Keep repeated commands and reload history, while leaving command evaluation and lesson verification separate and excluding raw input from telemetry.

Show Milo’s exact proposed file diff before saving. Apply changes writes only the reviewed edit, then updates the same proposal bubble to Changes applied. Refresh stale previews for review and preserve learner saves made in the meantime.

Offer Resume this project from durable lesson checkpoints after restart or a new browser visit, while clearing transient cart and quiz observations. Verify listProducts against populated isolated state before crediting the context lesson. Preserve collapsed file diffs across transcript updates and reloads, and wrap arbitrary generated product names and descriptions within their cards.

Add an early OpenAPI lesson that makes generated product names readable through a property example while keeping the handler random. Show spec edits as learner diffs and require the changed HTTP response to complete the lesson. Version new progress and telemetry as walkthrough 3 while preserving version 2 project numbering, helpers, and journals.

Show the demo folder’s full path in the welcome message with a link to open it in VS Code.

Introduce OpenAPI, schemas, and the bundled coffee-shop API description in a separate tutor message before inspecting the generated handler. Link to the demo’s openapi.yaml and render inline code and code examples with HTML code elements.

Show an accessible offline alert when the walkthrough cannot reach the server, with the terminal restart command and original port. Retry automatically, including interrupted initialization, and clear the alert when the server responds without treating expected HTTP errors as outages.

Include line numbers in all walkthrough file links. Resolve lesson edit destinations from the current saved source, link the schema exercise directly to Product.name, and open diffs at their first changed line.

Generate the coffee-shop OpenAPI document as YAML. Use YAML in the schema exercise, restart instructions, live schema checks, and editor destinations while retaining support for existing JSON demos.

Scroll the conversation to its latest content when messages arrive, including saved-file and REPL updates, while keeping the reading position during unchanged background checks.

Keep routine request and response summaries in the learner’s action bubble instead of repeating them as Milo messages. Preserve lesson feedback, failure guidance, and explanations of cart changes.

Replace copyable exercise solutions and prepared REPL commands with instructions that explain the intended behavior and edit location. Ask learners to replace .random() with .json(catalog) in the catalog lesson, and keep implementation choices with the learner throughout the walkthrough.

Label the continuation button with the next lesson’s name. Give each lesson a prominent standalone heading outside Milo’s conversation bubbles, showing one heading for lessons with multiple phases.

Celebrate successful saved-code checks in Milo’s conversation with feedback specific to each lesson and its next experiment. Preserve that feedback across reloads and avoid repeating it for the same saved revision.

Keep edit approval feedback on the proposal’s Changes applied status. Remove the redundant learner approval and tutor acknowledgment bubbles, including when displaying older saved conversations.

Remove the coffee shop’s duplicate API request log. Keep request and response details attached to their initiating actions in the conversation, and direct lesson instructions there.

Make each live exercise explicit about the next shop or terminal action and the expected result. Guide the 503 check from adding House Blend to clicking Place order and observing the preserved cart; give conversational follow-ups for repeated refreshes, sequential orders, and stock-rejection cleanup.

Break long tutor explanations into smaller messages and reveal each next part through an Okay button. Preserve the reading position across reloads, keep completed lessons readable, and keep acknowledgment separate from applying edits and completing exercises.

Make the divider between the conversation and coffee shop draggable, with keyboard resizing, minimum panel widths, and a saved split across reloads. Let the product cards adapt to the resized shop.

Require a user action between every new tutor message, including the boundary between the final part of an explanation and the next instruction. Each Okay click reveals exactly one bubble, so the OpenAPI background cannot be skipped by automatic follow-up rendering.

Track actually displayed messages separately from acknowledged sections so saved progress cannot reveal multiple new welcome or handoff bubbles at once. Animate new Milo text and smoothly follow it while preserving links, respecting reduced motion, and leaving previously read messages unanimated.
