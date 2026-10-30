---
"@counterfact/generator": minor
"counterfact": minor
"@counterfact/tutorials": patch
---

Generate a central `types/index.ts` exporting `Routes`, `Components`, and `Schemas` (an alias of `Components["schemas"]`). Include unused components, preserve lowercase OpenAPI categories, and use indexed `Routes` contracts in new route handlers while preserving existing route edits and deep imports.

Deprecate deep imports of generated operation and component types. Use the central exports throughout the manual, API reference, homepage, walkthrough, and agent guidance.

Expose `Context$`, `Scenario`, `Scenario$`, and directory-indexed `Middleware` through the central entry point. New context and scenario starters use central imports; context watching refreshes the helper module and middleware directory map. Dedicated helper imports remain compatible but deprecated.

Fix versioned handler narrowing after `minVersion()` checks, including early returns, negated conditions, and explicit else branches. Literal checks narrow both request and response contracts; dynamic union thresholds use a boolean overload to avoid incorrectly excluding possible versions.

Organize `Routes` as a tree of slash-prefixed path segments. Select `/hello/world` with `Routes["/hello"]["/world"]`; parent operations and child branches coexist, and generated handlers and documentation use the nested indexes.

Write watched helper modules atomically and skip unchanged content so TypeScript readers do not observe empty modules during regeneration.

Declare a local `Route` alias once per generated route file and annotate handlers with `Route["GET"]`, `Route["POST"]`, and other method keys. Regeneration reuses matching aliases and avoids existing local names while preserving user code.
