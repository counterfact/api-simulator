---
"@counterfact/types": minor
"@counterfact/runtime": minor
"counterfact": minor
"@counterfact/generator": minor
---

Add `response.status(code)` as a typed alternative to `response[code]`. Allow headers and cookies before status selection, narrowing generated status choices by header names and values while preserving required-header and body validation.

Deprecate bracket-based `response[statusCode]` selection in favor of `response.status(statusCode)`. Update documentation and generated route stubs to use the function-based selector; existing bracket-based handlers remain supported.
