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

Replace `api/routes/events.ts` with the handler below. Use `$.response.status(<status>).stream(iterable)` to return a stream. The content type is inferred from the OpenAPI spec (the first streaming media type not already supplied). Chaining .sse(events).stream(records) preserves both representations for negotiation; use .match(contentType, records) to select the alternative explicitly.


```ts
// api/routes/events.ts
import type { Routes } from "../types/index.js";

type Route = Routes["/events"];

export const GET: Route["GET"] = function ($) {
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

## Named events, reconnects, and heartbeats

Use `.sse(events)` when each item is an SSE frame with `data`, `event`, `id`,
`retry`, or `comment` fields. This selects `text/event-stream` explicitly.
`data` is already serialized text: use `JSON.stringify()` for JSON data.
The existing `.stream()` method continues to JSON-encode each yielded item
inside an SSE `data:` field, including objects with properties named `id` or `data`.

For OpenAPI 3.2, describe the event envelope in `itemSchema`:

```yaml
text/event-stream:
  itemSchema:
    type: object
    properties:
      data: { type: string }
      event: { type: string }
      id: { type: string }
      retry: { type: integer, minimum: 0 }
```

Declare an optional header parameter with `name: last-event-id` on the operation
if the route should resume a feed. The generator preserves parameter-name casing,
so use lowercase to match Node’s incoming header keys. Clients can send
`Last-Event-ID` because HTTP header names are case-insensitive. For an operation at `/events`:

```ts
import type { Routes } from "../types/index.js";

export const GET: Routes["/events"]["GET"] = ($) => {
  return $.response[200].sse(events($.headers["last-event-id"]));
};

async function* events(lastId?: string) {
  // Comments keep an idle connection active without dispatching a client event.
  yield { comment: "heartbeat" };

  const updates = [
    { id: "1", event: "update", data: JSON.stringify({ progress: 50 }) },
    { id: "2", event: "update", data: JSON.stringify({ progress: 100 }) },
  ];
  const start = updates.findIndex((event) => event.id === lastId) + 1;

  for (const update of updates.slice(start)) {
    yield { ...update, retry: 1000 };
  }
}
```

Counterfact forwards `Last-Event-ID` to the route; the route or its context
owns retention and replay policy. Browser `EventSource` clients reconnect when
an SSE response ends. Return HTTP 204 when the client should stop reconnecting.

Multiline `data` and `comment` values are split into SSE lines. An empty `id`
resets the client's remembered event ID. `retry` must be a nonnegative safe
integer in milliseconds. Event names and IDs cannot contain line breaks, and
IDs cannot contain null characters; invalid frames fail the stream.
A comment-only frame or a frame without `data` does not dispatch a message.
Generate heartbeats at the cadence your simulation needs; Counterfact does not
schedule them automatically. Keep long-running producers cancellable and use
`finally` to clean up resources when the client disconnects.

## Observe the stream

In another terminal, run:

```sh
curl -N http://localhost:3100/events
```

The response contains `data: {"id":1,"message":"hello"}` followed roughly half a second later by `data: {"id":2,"message":"world"}`, with a blank line after each event. `-N` disables curl's output buffering so you can observe the gap before the iterator finishes. For your own operation, change the path and declare the corresponding media type in OpenAPI; ordinary JSON bodies do not become incremental streams automatically.

See the [response builder reference](../api/responses.md).
