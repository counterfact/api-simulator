# Explore the API with Swagger UI

Swagger UI presents the loaded OpenAPI document in the browser. Use it to inspect operations, required parameters, and schemas, then send a request to the running simulator.

## Open the API browser

1. Start Counterfact with an OpenAPI document.
2. Open the Swagger UI URL printed at startup. For a single API, this is normally `http://localhost:3100/counterfact/swagger`.
3. Expand an operation and choose **Try it out**.
4. Supply its required inputs and execute the request.
5. Inspect the status, headers, and response body.

For multiple APIs, follow the printed URL for the corresponding group or version. The `/counterfact` entry redirects to the Swagger UI entry point.

## Interpret the result

The UI describes the contract. The response comes from the current running handler, which may use generated samples, custom behavior, state, or a proxy. Changing a handler changes its response; changing the handler does not rewrite the OpenAPI description.

For terminal exploration, use the [REPL](../features/repl.md) and [request builder](../features/route-builder.md).
