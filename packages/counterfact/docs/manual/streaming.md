# Streaming responses

Use a stream when the client needs to render events or records as they arrive. This lets you test progressive updates and disconnect handling.

Server-sent events (**SSE**) use `text/event-stream`; **JSONL** (newline-delimited JSON) sends one JSON value per line; **JSON-seq** separates JSON records with a record-separator character. An `AsyncIterable<T>` produces items over time, as the async generator below does with `yield`. OpenAPI’s `itemSchema` describes each item rather than the complete response body.

Counterfact supports OpenAPI 3.2 sequential media types. When your spec uses `itemSchema` on a `text/event-stream`, `application/jsonl`, or `application/json-seq` content type, the generated handler type expresses the body as `AsyncIterable<T>`.

## Define and generate a streaming operation

Follow the [project installation setup](../patterns/lifecycle-setup.md) to install Counterfact 3 or newer. In that project directory, save this complete operation as `openapi.yaml`. The streaming media type and `itemSchema` let generation produce the matching handler type:

```yaml
openapi: 3.2.0
info:
  title: Event stream
  version: 1.0.0
paths:
  /events:
    get:
      responses:
        "200":
          description: Events as they arrive
          content:
            text/event-stream:
              itemSchema:
                type: object
                required: [id, message]
                properties:
                  id:
                    type: integer
                  message:
                    type: string
```

Run `npx --no-install counterfact ./openapi.yaml api` and keep it running. See [Getting Started](../getting-started.md) for Node.js requirements and [custom route handlers](../features/routes.md) for how generated imports and editable files fit together.

## Return events

Replace `api/routes/events.ts` with the handler below. Use `$.response.status(<status>).stream(iterable)` to return a stream. The content type is inferred from the OpenAPI spec (the first streaming media type defined for that response).

```ts
// api/routes/events.ts
import type { HTTP_GET } from "../types/paths/events.types.js";

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

In another terminal, run:

```sh
curl -N http://localhost:3100/events
```

The response contains `data: {"id":1,"message":"hello"}` followed roughly half a second later by `data: {"id":2,"message":"world"}`, with a blank line after each event. `-N` disables curl's output buffering so you can observe the gap before the iterator finishes. For your own operation, change the path and declare the corresponding media type in OpenAPI; ordinary JSON bodies do not become incremental streams automatically.

See the [response builder reference](../api/responses.md).
