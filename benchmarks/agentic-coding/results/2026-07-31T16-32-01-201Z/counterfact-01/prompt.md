# Coding task: resilient ticket collection

Implement `fetchAllTickets` in `src/client.mjs`.

The function must collect every ticket from the API described by
`openapi.yaml`, following `nextCursor` until it is absent. It should return one
array in API order with duplicate ticket IDs removed (keep the first value).

The client is expected to behave sensibly when the service is temporarily
unavailable or rate limited:

- Retry HTTP 429 and 5xx responses, up to `maxRetries` retries for a request.
- Honor a numeric `Retry-After` response header when present.
- Do not retry other 4xx responses.
- Throw a useful error when a request ultimately fails.

Do not add dependencies. You may add tests or helper files. Run any useful
checks before finishing.

The required public API is:

```js
export async function fetchAllTickets({
  baseUrl,
  maxRetries = 3,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
})
```

`sleep` is injectable so callers can test retry timing without waiting.


Work autonomously in the current workspace. Implement the task and verify your work.

A Counterfact sandbox is running at http://127.0.0.1:61496. You may make real HTTP requests to it. Select a deterministic behavior with POST /control/reset and JSON {"scenario":"SCENARIO"}; available scenarios are happy, rate-limit, transient-503, permanent-429, and bad-request. Inspect GET /control/stats when useful. Exercise the sandbox before finishing.
