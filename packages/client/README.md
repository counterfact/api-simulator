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
`cookies()`, `body()`, `form()`, or `method()` returns a new builder, so a
common request can be safely branched into reusable variants.

The builder validates required OpenAPI path, query, header, cookie, body, and
form inputs. Use `cookies()` to merge percent-encoded cookie pairs with an
existing `Cookie` header. Use `form()` for OpenAPI form content; it sends
URL-encoded data by default and text-only multipart data when
`multipart/form-data` is the sole declared form type. Binary and file form
parts are not supported.

Only one request entity is active. Calling `body()` after `form()`, or `form()`
after `body()`, clears the earlier entity so the last method wins.

See [`examples/reusable-request.mjs`](./examples/reusable-request.mjs) for a
complete example with a local HTTP server.
