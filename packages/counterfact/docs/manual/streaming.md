# Streaming responses

Use a stream when the client needs to render events or records as they arrive. This lets you test progressive updates and disconnect handling.

Counterfact supports OpenAPI 3.2 sequential media types. When your spec uses `itemSchema` on a `text/event-stream`, `application/jsonl`, or `application/json-seq` content type, the generated handler type expresses the body as `AsyncIterable<T>`.

Use `$.response.status(<status>).stream(iterable)` to return a stream from any route handler. The content type is inferred automatically from the OpenAPI spec (the first streaming media type defined for that response).

```ts
export const GET: HTTP_GET = function ($) {
  return $.response.status(200).stream(events());
};

async function* events() {
  yield { id: 1, message: "hello" };
  await new Promise((resolve) => setTimeout(resolve, 500));
  yield { id: 2, message: "world" };
}
```

Each item yielded by the iterable is serialised automatically:

| Content type           | Wire format per item |
| ---------------------- | -------------------- |
| `text/event-stream`    | `data: <json>\n\n`   |
| `application/json-seq` | `\x1e<json>\n`       |
| JSONL / ndjson         | `<json>\n`           |

For `text/event-stream` responses, Counterfact also sets `Cache-Control: no-cache` and `X-Accel-Buffering: no` automatically.

## Observe the stream

Request the route with `curl -N http://localhost:3100/your-stream-path`, replacing the path with the operation in your specification. Each yielded item should arrive before the iterator finishes. Use the corresponding media type in your OpenAPI response; ordinary JSON bodies do not become incremental streams automatically.

See the [response builder reference](../api/responses.md).
