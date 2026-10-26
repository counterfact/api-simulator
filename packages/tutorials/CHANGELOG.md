# @counterfact/tutorials

## 0.2.0

### Minor Changes

- f035672: Extract guided learning experiences into `@counterfact/tutorials`, starting with the coffee-shop tour. Keep the existing offline first-run experience while moving tour content, presentation, progression, saved-handler checks, and project preparation out of the CLI package. Future tours share this package; the CLI retains startup and terminal interactions.

  Format the walkthrough's generated TypeScript files with Prettier, including the editable product, order, context, and scenario files.

### Patch Changes

- eceb762: Report coffee-shop walkthrough milestones through the existing CLI telemetry, honoring CI and telemetry opt-out settings. Correlate events within a temporary simulator session, deduplicate reloads and revisits, and distinguish reaching the final screen from completing every exercise. Exclude paths, source code, cart contents, and error messages.
- Updated dependencies [70cbe2e]
- Updated dependencies [b0d11b6]
  - @counterfact/runtime@0.3.0
