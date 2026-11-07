# @counterfact/types

## 0.3.0

### Minor Changes

- 354e288: Support OpenAPI 3 multipart/form-data request bodies in generated handler types
  and the built-in Koa server. Expose uploaded bytes and metadata through
  MultipartFile, decode declared fields and repeated arrays, validate required
  fields and uploads, and reject malformed or oversized multipart requests.

## 0.2.0

### Minor Changes

- b0d11b6: Add `response.status(code)` as a typed alternative to `response[code]`. Allow headers and cookies before status selection, narrowing generated status choices by header names and values while preserving required-header and body validation.

  Deprecate bracket-based `response[statusCode]` selection in favor of `response.status(statusCode)`. Update documentation and generated route stubs to use the function-based selector; existing bracket-based handlers remain supported.
