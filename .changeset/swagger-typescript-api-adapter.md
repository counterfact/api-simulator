---
"@counterfact/client": minor
"@counterfact/generator": minor
"swagger-typescript-api-adapter": minor
"counterfact": minor
---

Add a separate adapter package for swagger-typescript-api Fetch consumers.
Apply `wrapSta(createSdk)` to a generated Counterfact SDK factory to obtain an
STA-style `Api` constructor. The adapter accepts either a config object or a
shared `HttpClient` and supports `unwrapResponseData` as an adapter option.
