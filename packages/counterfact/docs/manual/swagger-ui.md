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

## Supported specs and versioned documentation

The built-in Swagger UI uses version 5.32.0 and supports Swagger 2.0 and OpenAPI
3.0.4, 3.1, and 3.2 documents. Grouped APIs have separate documentation pages at
`/counterfact/swagger/<group>/`, backed by `/counterfact/openapi/<group>`.

From a repository checkout, `npm run go:multiple-apis` starts the example and
Petstore APIs at `/example` and `/petstore`. `npm run go:multiple-versions` starts
two versions of the Greetings API at `/v1/greeting` and `/v2/greeting`; v2 adds a
`locale` field. Both versions share generated handlers and types in the
`greetings` group. Startup prints a documentation link for each version:
`/counterfact/swagger/greetings/?version=v1` and
`/counterfact/swagger/greetings/?version=v2`. Each page loads that version's
contract and uses its request prefix for Try it out. The OpenAPI documents are
available at `/counterfact/openapi/greetings?version=v1` and
`/counterfact/openapi/greetings?version=v2`. Omitting `version` continues to show
the first configured version (v1); an unknown version returns HTTP 404.
Both commands build first and run from
the Counterfact package directory so fixture paths resolve correctly. Generated
files go into `packages/counterfact/out/multiple-apis` and
`packages/counterfact/out/multiple-versions`, respectively.
