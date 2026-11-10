---
"@counterfact/types": patch
"@counterfact/generator": patch
"@counterfact/runtime": patch
"counterfact": patch
---

Support an explicit content type in `.binary(body, contentType)` so PDF, image, and other binary responses negotiate correctly with the client's `Accept` header. Preserve `application/octet-stream` as the one-argument default and send bytes unchanged, including binary XML representations.

Expose declared binary media types in generated response builders while preserving representation narrowing and required headers. Document binary bodies, base64 decoding, and the default content type.
