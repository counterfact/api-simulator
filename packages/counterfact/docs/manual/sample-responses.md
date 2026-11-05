# Automatic sample responses

Counterfact generates handlers that return sample data from the response schema. Use this to connect a frontend before implementing custom behavior. These responses model the contract's shape; they do not model relationships or changes between requests.

## Use the generated response

Start Counterfact with your specification and inspect an operation's route file:

Keep the generated `Routes` import and select your operation by path and method. These examples use `GET /pet/{petId}`; use the path declared in your own spec. Counterfact supplies the handler’s `$` argument, including its response builder; see [handler arguments](../api/handlers.md).

```ts
import type { Routes } from "../../types/index.js";

type Route = Routes["/pet"]["/{petId}"];

export const GET: Route["GET"] = function ($) {
  return $.response.status(200).random();
};
```

Send a request to that operation. The response uses the selected status's OpenAPI definition, including examples where available. Values may vary between requests.

## Select a named example

For a predictable screen state, define a named example on the response media type in OpenAPI. For example, add this response definition to a GET operation whose 200 JSON schema permits the shown pet:

```yaml
responses:
  "200":
    description: A pet
    content:
      application/json:
        schema:
          type: object
          required: [id, name, photoUrls]
          properties:
            id: { type: integer }
            name: { type: string }
            photoUrls:
              type: array
              items: { type: string }
        examples:
          successResponse:
            value: { id: 1, name: Fluffy, photoUrls: [] }
```

This is an operation fragment, not a complete OpenAPI document. Regenerate types, then select the key under `examples` by name:

```ts
import type { Routes } from "../../types/index.js";

type Route = Routes["/pet"]["/{petId}"];

export const GET: Route["GET"] = function ($) {
  return $.response.status(200).example("successResponse");
};
```

The name must exist for that operation and status. For a literal, deterministic body, use `.json(value)` instead.

## Choose when to add state

Use a [stateful context](../features/state.md) when a later request needs to observe an earlier action. Random sample responses do not persist a newly created resource. `.random()` and `.example()` require a loaded specification, including when starting Counterfact from code.

See [response builders](../api/responses.md) for exact methods.
