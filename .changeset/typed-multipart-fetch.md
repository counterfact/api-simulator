---
"@counterfact/client": minor
"@counterfact/generator": minor
"counterfact": minor
"swagger-typescript-api-adapter": patch
---

Accept typed OpenAPI 3.x multipart objects in the fluent client and named SDK.
File fields accept File, Blob, or Uint8Array. The STA adapter now sends byte
arrays as binary multipart parts rather than JSON.
