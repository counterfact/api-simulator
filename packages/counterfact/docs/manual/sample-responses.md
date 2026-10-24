# Automatic sample responses

Counterfact generates handlers that return sample data from the response schema. Use this to connect a frontend before implementing custom behavior. These responses model the contract's shape; they do not model relationships or changes between requests.

## Use the generated response

Start Counterfact with your specification and inspect an operation's route file:

```ts
export const GET: HTTP_GET = function ($) {
  return $.response.status(200).random();
};
```

Send a request to that operation. The response uses the selected status's OpenAPI definition, including examples where available. Values may vary between requests.

## Select a named example

For a predictable screen state, define a named example on the response media type in OpenAPI, regenerate the types, then select it:

```ts
export const GET: HTTP_GET = function ($) {
  return $.response.status(200).example("successResponse");
};
```

The name must exist for that operation and status. For a literal, deterministic body, use `.json(value)` instead.

## Choose when to add state

Use a [stateful context](../features/state.md) when a later request needs to observe an earlier action. Random sample responses do not persist a newly created resource. `.random()` and `.example()` require a loaded specification, including when starting Counterfact from code.

See [response builders](../api/responses.md) for exact methods.
