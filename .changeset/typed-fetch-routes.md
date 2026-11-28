---
"@counterfact/client": minor
"@counterfact/generator": minor
"@counterfact/types": minor
"counterfact": minor
---

OpenAPI 3.x type generation now includes a Fetch client under `client/`. Use
`--generate-client` to generate only the client. Reuse route prefixes with
`segment()` and send requests once all required inputs are present. Validated
responses narrow by matched status. Responses outside the contract reject with
an error. Response validators are compiled during generation.

Generated clients apply OpenAPI security requirements and support per-request
authentication, credentials, redirect handling, and cancellation.

Completed fluent requests can call `stream()` to read declared byte responses
as they arrive.

Use `createSdk()` for named operations grouped by path segment or OpenAPI tag.
The named SDK shares request handling and validated response types with the fluent client.
