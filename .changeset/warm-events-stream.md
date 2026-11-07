---
"@counterfact/types": minor
"@counterfact/runtime": minor
"counterfact": minor
---

Add an explicit `.sse(events)` response builder for named events, event IDs, retry intervals, multiline string data, and heartbeat comments. Preserve `.stream()` JSON data behavior and expose the existing NDJSON stream support in generated handler types.

Preserve existing content representations when composing streaming shortcuts, and select the first streaming media type not yet supplied. Require SSE event iterables in generated types and retain fluent methods in wide handlers.
