---
"@counterfact/generator": patch
---

Include undefined in generated handler body types for optional OpenAPI 3 request bodies, including JSON, URL-encoded forms, and multipart forms. Preserve required and nullable body distinctions so strict TypeScript catches unguarded access to an absent body.
