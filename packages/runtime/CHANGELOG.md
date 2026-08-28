# @counterfact/runtime

## 0.1.3

### Patch Changes

- f90e88d: Normalize route-prefix trailing slashes in linear time.
- fb73d12: Match configured route prefixes at URL path-segment boundaries.
- 8712a09: Stop random response generation from logging internal options to stdout.
- 8b13036: Avoid generating duplicate required response headers with different casing.
- afc52c0: Apply OpenAPI header parameter types regardless of header-name casing.
- 3bfb75d: Validate response headers case-insensitively as required by HTTP.
- Updated dependencies [28aafab]
  - @counterfact/openapi@0.1.3

## 0.1.2

### Patch Changes

- 669d9dd: Updated dependency `js-yaml` in `@counterfact/openapi`, `@counterfact/runtime`, and `counterfact` to `5.3.0`.
- Updated dependencies [669d9dd]
  - @counterfact/openapi@0.1.2

## 0.1.1

### Patch Changes

- 5d1ea2e: Treat required request header names as case-insensitive during validation.
- Updated dependencies [f5e437d]
  - @counterfact/openapi@0.1.1
