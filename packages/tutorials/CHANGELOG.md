# @counterfact/tutorials

## 0.2.0

### Minor Changes

- f035672: Extract guided learning experiences into `@counterfact/tutorials`, starting with the coffee-shop tour. Keep the existing offline first-run experience while moving tour content, presentation, progression, saved-handler checks, and project preparation out of the CLI package. Future tours share this package; the CLI retains startup and terminal interactions.

  Format the walkthrough's generated TypeScript files with Prettier, including the editable product, order, context, and scenario files.

### Patch Changes

- Updated dependencies [70cbe2e]
- Updated dependencies [b0d11b6]
  - @counterfact/runtime@0.3.0
