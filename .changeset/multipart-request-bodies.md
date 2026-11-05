---
"@counterfact/generator": minor
"@counterfact/runtime": minor
"@counterfact/types": minor
"counterfact": patch
---

Support OpenAPI 3 multipart/form-data request bodies in generated handler types
and the built-in Koa server. Expose uploaded bytes and metadata through
MultipartFile, decode declared fields and repeated arrays, validate required
fields and uploads, and reject malformed or oversized multipart requests.
