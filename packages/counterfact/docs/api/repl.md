# REPL and HTTP client

The terminal REPL evaluates JavaScript against the running simulator. Start it from the CLI or call `api.startRepl()`.

| Binding or command          | Purpose                                                                        |
| --------------------------- | ------------------------------------------------------------------------------ |
| `context`                   | Root context, or contexts keyed by API group.                                  |
| `loadContext(path)`         | Read a nested context; use `loadContext.group(path)` for multiple APIs.        |
| `store`                     | Live application store, when one exists.                                       |
| `routes`                    | Loaded routes, grouped for multiple APIs.                                      |
| `client`                    | Raw HTTP client supporting standard HTTP methods.                              |
| `route(path)`               | Immutable OpenAPI-aware request builder; grouped by API key for multiple APIs. |
| `.scenario`                 | List available scenarios.                                                      |
| `.scenario module/function` | Execute a named scenario.                                                      |

## Request builder methods

| Method             | Result                                                     |
| ------------------ | ---------------------------------------------------------- |
| `.method(method)`  | Select the HTTP method.                                    |
| `.path(values)`    | Set path parameters.                                       |
| `.query(values)`   | Set query parameters.                                      |
| `.headers(values)` | Set request headers.                                       |
| `.cookies(values)` | Set cookie parameters.                                     |
| `.form(values)`    | Set text form fields (URL-encoded or text-only multipart). |
| `.body(value)`     | Set the request body.                                      |
| `.ready()`         | Report whether required parameters are supplied.           |
| `.missing()`       | List missing required parameters.                          |
| `.help()`          | Describe the selected OpenAPI operation.                   |
| `.send()`          | Send the request.                                          |

Builder configuration methods return new builders, so requests can be reused and branched. Required-parameter checks are a preparation aid, not a replacement for server validation. See [request builder](../features/route-builder.md) for examples and response handling.

## Standalone client

Import `createOpenApiRouteCatalog` and `createRouteFunction` from `@counterfact/client` to use the builder outside the REPL. See [public packages](./packages.md).
