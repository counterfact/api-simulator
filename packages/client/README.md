# `@counterfact/client`

Counterfact's raw HTTP client and immutable, OpenAPI-aware request builder.
Use it to construct, inspect, reuse, and send requests without starting the
Counterfact REPL or simulator.

## Reusable requests

```js
import {
  createOpenApiRouteCatalog,
  createRouteFunction,
} from "@counterfact/client";

const catalog = createOpenApiRouteCatalog({
  paths: {
    "/pets/{petId}": {
      get: {
        parameters: [
          {
            in: "path",
            name: "petId",
            required: true,
            type: "integer",
          },
        ],
        responses: { 200: { description: "A pet" } },
      },
    },
  },
});

const route = createRouteFunction(3000, "localhost", catalog);
const pet = route("/pets/{petId}").method("get").path({ petId: 42 });

console.log(pet.ready());
console.log(pet.help());
await pet.send();
```

Builder methods are immutable: calling `path()`, `query()`, `headers()`,
`body()`, or `method()` returns a new builder, so a common request can be
safely branched into reusable variants.

See [`examples/reusable-request.mjs`](./examples/reusable-request.mjs) for a
complete example with a local HTTP server.
