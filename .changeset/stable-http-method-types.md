---
"counterfact": major
"@counterfact/generator": major
---

Generate operation and parameter types with stable HTTP method names such as
`HTTP_GET` and `HTTP_GET_Query`, independent of OpenAPI operationId. On CLI
startup, automatically migrate legacy operationId-based route imports and their
references while preserving route logic, explicit aliases, comments, and strings.
References outside route files must be updated manually.
