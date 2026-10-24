# Interactive REPL

The REPL is a JavaScript prompt connected directly to the running server — like the browser DevTools console, but for your mock API. For a default OpenAPI-backed session, startup output includes:

```text
Counterfact v<version>
→ Reading OpenAPI document…
✓ OpenAPI document ready
→ Generating routes and types…
✓ Generated routes and types
✓ Mock server → http://localhost:3100
✓ Swagger UI → http://localhost:3100/counterfact/swagger/
✓ Watching routes and types
⬣>
```

The `context` binding is your authored `Context` instance. The following examples use the pet context from the [state guide](./state.md), with `add`, `get`, and `list` methods; generation alone does not create those methods.

At the prompt you can interact with the live context:

```js
// add a single pet
context.add({ name: "Fluffy", photoUrls: [] });

// add 100 pets
for (let i = 0; i < 100; i++) context.add({ name: `Pet ${i}`, photoUrls: [] });

// query state
context.list().filter((pet) => pet.name.startsWith("F"));
```

To access context from a subdirectory:

```js
const petsContext = loadContext("/pets");
```

An [API group](../manual/concepts.md#api-groups-versions-and-url-prefixes) is a configured name for specs sharing code and context state. For entries with `group: billing` and `group: inventory` (see [configuration](../manual/multiple-apis.md)), REPL state is grouped by those names:

```js
context.billing;
context.inventory;
routes.billing;
routes.inventory;
```

In this mode, `loadContext` and `route` are also grouped by API group:

```js
loadContext.billing("/pets");
route.inventory("/stock/{sku}");
```

When configuring multiple APIs, each spec must define a non-empty group and a
unique group/version pair. Versions of the same API can share a group; distinct
unversioned APIs need distinct groups.

A [shared store](../patterns/shared-store.md) holds data across groups. `basePath` is the configured output directory. If `<basePath>/_.store.ts` exists, `store` is an unqualified REPL binding in
both single- and multi-API sessions. It is the same live application-level
object received by every group's context constructors:

```js
store.customers.size;
store.orders.clear();
```

Adding a valid `_.store.ts` while the server is watching makes the binding
available to an already-open REPL. Scenario functions do not receive the store
in their `$` argument; use a context method when a scenario needs to seed shared
state.

The built-in `client` object lets you make HTTP requests from the prompt without leaving the terminal:

```js
client.get("/users");
client.post("/users", { name: "bob" });
client.put("/users/1", { name: "robert" }, { "x-api-version": "2" });
```

All standard HTTP methods are supported. Arguments are: path, body (where applicable), headers.

When an OpenAPI document is loaded, pressing Tab while typing `client.get("...` or `route("...` autocompletes using OpenAPI path templates (for example, `/example/hello/{name}`).

The built-in `route()` function creates a fluent request builder that validates required parameters against your OpenAPI document before sending:

```js
// Build and inspect before sending
const req = route("/pet/{petId}").method("get").path({ petId: 42 });
req.ready(); // true / false
req.missing(); // lists missing required parameters
req.help(); // prints OpenAPI docs for the operation
await req.send();
```

See the [Route Builder guide](./route-builder.md) for full documentation.

## Inspect and steer a session

These examples use the same pet context’s `add()` and `list()` methods. Start from the [first-ten-minutes handlers](../first-10-minutes.md) so HTTP requests read and write that context.

Start the server with the REPL enabled (the default when running via `npx counterfact@latest`). The prompt `⬣>` indicates the REPL is ready.

### Seed test data

```
⬣> context.add({ name: "Fluffy", status: "available", photoUrls: [] })
{ id: 1, name: 'Fluffy', status: 'available', photoUrls: [] }

⬣> context.add({ name: "Rex", status: "pending", photoUrls: [] })
{ id: 2, name: 'Rex', status: 'pending', photoUrls: [] }
```

### Send real requests and inspect responses

`client` prints HTTP request/response text and returns a promise of the raw response string. The transcripts below show abbreviated response output: request logs, headers, and colors are omitted. `void` starts the request without also displaying the returned promise; use `await client.get(...)` when you need the raw string.

```
⬣> void client.get("/pet/1")
HTTP/1.1 200 OK

{"id":1,"name":"Fluffy","status":"available","photoUrls":[]}

⬣> void client.post("/pet", { name: "Bella", status: "available", photoUrls: [] })
HTTP/1.1 200 OK

{"id":3,"name":"Bella","status":"available","photoUrls":[]}
```

### Toggle failure modes without editing a file

If the context exposes a failure flag (see [Simulate Failures and Edge Cases](../manual/edge-cases.md)):

```
⬣> context.isRateLimited = true
⬣> void client.get("/pet/1")
HTTP/1.1 429 Too Many Requests

Too Many Requests

⬣> context.isRateLimited = false
⬣> void client.get("/pet/1")
HTTP/1.1 200 OK

{"id":1,"name":"Fluffy","status":"available","photoUrls":[]}
```

### Inspect state mid-session

```
⬣> context.list()
[
  { id: 1, name: 'Fluffy', status: 'available', photoUrls: [] },
  { id: 2, name: 'Rex', status: 'pending', photoUrls: [] },
  { id: 3, name: 'Bella', status: 'available', photoUrls: [] }
]

⬣> context.list().filter(p => p.status === "available").length
2
```

### Control the proxy at runtime

```
⬣> .proxy url https://api.example.com
⬣> .proxy on /payments
⬣> void client.get("/payments/42")
HTTP/1.1 200 OK

... real response body ...

⬣> .proxy off /payments
```

These commands enable and then disable the `/payments` proxy entry. More specific child entries can still override it; turning off the root alone does not clear a subtree override.

## Reusable scenarios

Use `.scenario name` (or `.scenario group name` for multiple API groups) to apply a named state transformation. For scenario files, path resolution, composition, and the awaited startup hook, see [scenario scripts](../patterns/scenario-scripts.md).

## See also

- [Route Builder](./route-builder.md) — fluent request builder with OpenAPI introspection
- [State](./state.md) — the context objects you interact with from the REPL
- [Patterns: Scenario Scripts](../patterns/scenario-scripts.md)
- [Patterns: Live Server Inspection with the REPL](repl.md)
- [Patterns: Share State Across API Groups](../patterns/shared-store.md)
- [Find your workflow](../usage.md)
