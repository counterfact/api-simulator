# @counterfact/tutorials

## 0.2.2

### Patch Changes

- a724401: Generate a central `types/index.ts` exporting `Routes`, `Components`, and `Schemas` (an alias of `Components["schemas"]`). Include unused components, preserve lowercase OpenAPI categories, and use indexed `Routes` contracts in new route handlers while preserving existing route edits and deep imports.

  Deprecate deep imports of generated operation and component types. Use the central exports throughout the manual, API reference, homepage, walkthrough, and agent guidance.

  Expose `Context$`, `Scenario`, `Scenario$`, and directory-indexed `Middleware` through the central entry point. New context and scenario starters use central imports; context watching refreshes the helper module and middleware directory map. Dedicated helper imports remain compatible but deprecated.

  Fix versioned handler narrowing after `minVersion()` checks, including early returns, negated conditions, and explicit else branches. Literal checks narrow both request and response contracts; dynamic union thresholds use a boolean overload to avoid incorrectly excluding possible versions.

  Organize `Routes` as a tree of slash-prefixed path segments. Select `/hello/world` with `Routes["/hello"]["/world"]`; parent operations and child branches coexist, and generated handlers and documentation use the nested indexes.

  Write watched helper modules atomically and skip unchanged content so TypeScript readers do not observe empty modules during regeneration.

  Declare a local `Route` alias once per generated route file and annotate handlers with `Route["GET"]`, `Route["POST"]`, and other method keys. Regeneration reuses matching aliases and avoids existing local names while preserving user code.

- Updated dependencies [40656be]
- Updated dependencies [93944c6]
  - @counterfact/runtime@0.3.2

## 0.2.1

### Patch Changes

- Updated dependencies [ad9068d]
- Updated dependencies [9871d4c]
  - @counterfact/runtime@0.3.1

## 0.2.0

### Minor Changes

- f035672: Extract guided learning experiences into `@counterfact/tutorials`, starting with the coffee-shop tour. Keep the existing offline first-run experience while moving tour content, presentation, progression, saved-handler checks, and project preparation out of the CLI package. Future tours share this package; the CLI retains startup and terminal interactions.

  Format the walkthrough's generated TypeScript files with Prettier, including the editable product, order, context, and scenario files.

### Patch Changes

- eceb762: Report coffee-shop walkthrough milestones through the existing CLI telemetry, honoring CI and telemetry opt-out settings. Correlate events within a temporary simulator session, deduplicate reloads and revisits, and distinguish reaching the final screen from completing every exercise. Exclude paths, source code, cart contents, and error messages.
- Updated dependencies [70cbe2e]
- Updated dependencies [b0d11b6]
  - @counterfact/runtime@0.3.0
