---
"@counterfact/client": minor
"@counterfact/generator": minor
"@counterfact/types": minor
"counterfact": minor
---

Generate a standalone Fetch client from an OpenAPI 3.x specification with
`--generate-client`. Reuse route prefixes with `segment()` and send requests
once all required inputs are present. Validated responses narrow by matched status. Responses outside the contract
reject with an error. Response validators are compiled during generation.

Generated clients apply OpenAPI security requirements and support per-request
authentication, credentials, redirect handling, and cancellation.

Call generated operations by their OpenAPI operation ID through the typed
`route.operations` namespace.
