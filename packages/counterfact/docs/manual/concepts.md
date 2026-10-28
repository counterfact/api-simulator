# How Counterfact fits together

Start with a specification and a running API. Add state, scenarios, or multiple APIs when your client workflow needs them. This overview explains the terms used throughout the [user manual](../manual.md).

## Specification, route, and handler

**OpenAPI**, formerly Swagger, describes an API’s endpoints, parameters, and responses in YAML or JSON. Give Counterfact that file or its URL to generate a working mock API. The [quick start](../getting-started.md) uses a public Petstore document so you can try Counterfact without supplying your own.

A **route** maps a URL path to a file. An **operation** is an HTTP method on that path. A **handler** is the function that implements an operation. For example, `GET /pet/{petId}` uses the `GET` export in `routes/pet/{petId}.ts`.

```sh
npx counterfact@latest openapi.yaml api
```

Here `openapi.yaml` is your spec and `api/` is the output directory. The library calls this directory **`basePath`**; a CLI YAML config sets it with `destination: api`. It is a filesystem location, separate from the server's base URL (`http://localhost:3100` in the default CLI session).

```text
api/                         # basePath / output directory
  routes/                    # editable handler and context source
    _.context.ts             # optional class you author
    pet.ts                   # operations on /pet
    pet/
      {petId}.ts             # operations on /pet/{petId}
  types/                     # generated contracts; do not edit
  scenarios/                 # optional setup functions you author
    index.ts
```

Counterfact generates starter handlers and request/response types from the spec. Regenerating keeps your changes to the handlers. A generated handler initially returns sample data; it does not implement create/read relationships automatically. See [generated code](../features/generated-code.md) and [sample responses](./sample-responses.md).

## The handler argument `$`

Counterfact calls each handler with one object conventionally named `$`. It supplies request data, response-building methods, and the route's context:

```ts
// api/routes/pet/{petId}.ts
import type { Routes } from "../../types/index.js";

export const GET: Routes["/pet/{petId}"]["GET"] = function ($) {
  return $.response.status(200).json({
    id: $.path.petId,
    name: "Fluffy",
    photoUrls: [],
    status: "available",
  });
};
```

`Routes["/pet/{petId}"]["GET"]` selects that operation's generated contract. `$.path.petId` is the URL parameter, and `$.response.status(200).json(...)` builds its response. The `$` name is an ordinary function parameter; the generated type determines which members are available. See [route handlers](../features/routes.md).

## Context: state shared by nearby routes

A **context** is an instance of a `Context` class you export from `_.context.ts`. Put it under `routes/` to share state across that directory and its descendants. A nested context replaces the parent context for its subtree; parent fields are not automatically merged into it.

The [first ten minutes](../first-10-minutes.md) creates a small pet context with `add(pet)` and `get(id)`. A POST handler calls `$.context.add($.body)` and a later GET calls `$.context.get($.path.petId)`. These methods are application code you write, not built-in Counterfact methods. The [state guide](../features/state.md) extends the example with list, remove, and reset methods.

A **context registry** is Counterfact's collection of these live objects, looked up by route path. Use `api.loadContext("/")` from test code or `loadContext("/pets")` in the REPL to find the context for a path. Context constructors also receive a `loadContext` helper for connecting subtrees within one API group. See [nested contexts](./nested-contexts.md).

## Scenarios and the REPL

A **scenario** is a named function you author under `scenarios/` to change live state: seed pets, enable a failure, or restore part of a workflow. Export `startup` from `scenarios/index.ts` for initialization. Other exports run on demand. A scenario transforms the current state; a full simulator `reset()` reconstructs the baseline and awaits startup again.

The **REPL** (read–eval–print loop) is the JavaScript prompt in the terminal where Counterfact is running. At the `⬣>` prompt, `context` exposes your root context, `client` sends HTTP requests, and `route(path)` builds an inspectable, reusable request. `routes` is a collection in which you can save named request builders. Enter `.scenario soldPets` to run a scenario. See [scenario scripts](../patterns/scenario-scripts.md) and [the REPL](../features/repl.md).

### Function arguments

The same parameter name appears in several kinds of function, but their capabilities differ:

| Function            | What Counterfact supplies                                                       | Generated type                 |
| ------------------- | ------------------------------------------------------------------------------- | ------------------------------ |
| Operation handler   | Request data, response builders, delay/proxy helpers, nearest context           | `Routes["/path"]["GET"]`, etc. |
| Context constructor | `loadContext`, `readJson`, and the optional shared store                        | `Context$`                     |
| Scenario            | `context`, `loadContext`, `route`, and `routes`                                 | `Scenario` / `Scenario$`       |
| Route middleware    | Typed request data and nearest context, plus a separate `respondTo($)` callback | `Middleware`                   |

Import `Routes`, `Components`, and `Schemas` from `types/index.js`. Import context, scenario, and middleware helper types from their matching files under `types/`. Only the context constructor receives `store` directly. Handlers and middleware delegate shared behavior to context methods. The scenario's `routes` collection is also available as `routes` in the REPL. See the [state reference](../api/state.md) for the arguments each function receives.

## API groups, versions, and URL prefixes

An **API group** is a named collection of specifications that share generated route files and a context registry. Declare its name with `group` in each spec entry. Distinct APIs usually use different groups; versions of the same API use the same group.

| Setting    | Controls                                                              | Example   |
| ---------- | --------------------------------------------------------------------- | --------- |
| `basePath` | Root API directory on disk                                            | `api/`    |
| `group`    | Subdirectory under that root and shared context/scenario state        | `catalog` |
| `version`  | Contract version label and version-aware handler types within a group | `v1`      |
| `prefix`   | URL text prepended to the spec's declared paths                       | `/api/v1` |

For example, given OpenAPI documents that both declare `/items`:

```yaml
# counterfact.yaml
destination: api
spec:
  - source: ./catalog-v1.yaml
    group: catalog
    version: v1
    prefix: /api/v1
  - source: ./catalog-v2.yaml
    group: catalog
    version: v2
    prefix: /api/v2
```

Run `npx counterfact --config counterfact.yaml`. Both versions use handler files under `api/catalog/routes/` and share the group's contexts. Their URLs are `/api/v1/items` and `/api/v2/items` because of the explicit prefixes. Omitting a prefix leaves `/items` unchanged; group and version labels never add URL segments. Version order follows declaration order, which `$.minVersion()` uses in versioned handlers.

To serve independent APIs, use distinct groups such as `customers` and `orders`. They have separate context registries, even if they declare the same route path. A directory such as `routes/admin/` is a route subtree within a group, not a separate API group. A single-spec quick-start project uses the flat `api/routes/` layout and needs no named group configuration.

In a multi-API REPL, bindings use configured group names: `context.catalog`, `loadContext.catalog("/items")`, and `route.catalog("/api/v1/items")`. See [multiple APIs](./multiple-apis.md) and [API versions](../features/multiple-versions.md).

## Store: state shared across groups

When an order in one API group must reference a customer from another, add a **shared application store**: a `Store` class exported from `api/_.store.ts`, alongside the group directories. Counterfact constructs one store per simulator and passes it to each context constructor. Your contexts expose the operations their routes need.

Keep state in a context when only one group needs it. Use a store when several groups need to observe the same fact. Ordinary hot reload preserves live state; explicit simulator reset constructs fresh contexts and a fresh store. See [shared stores](../patterns/shared-store.md) for configuration, code, and lifecycle examples.
