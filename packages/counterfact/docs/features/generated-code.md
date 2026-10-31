# Generated Code

Counterfact generates two directories from your OpenAPI document:

- 📂 **`types/`** — fully typed request/response interfaces, auto-regenerated whenever the OpenAPI document changes. Don't edit these by hand.
- 📂 **`routes/`** — one TypeScript file per API path. These are yours to edit. Out of the box each file returns a random, schema-valid response. You can leave them as-is or customize as much as you like.

See the [FAQ](../faq.md) for common questions about source control, editing, and regeneration.

No OpenAPI document? See [using Counterfact without OpenAPI](./without-openapi.md).

## Generated file structure

The output directory is called `basePath` in library options and `destination` in the CLI YAML config. The optional context and store files below are custom: a context shares behavior within a route subtree; a [store](../patterns/shared-store.md) shares state across separately configured [API groups](../manual/concepts.md#api-groups-versions-and-url-prefixes).

```
<output-directory>/
├── _.store.ts                 # application-level state shared across API groups (optional)
├── routes/
│   ├── _.context.ts           # shared in-memory state (optional)
│   ├── _.middleware.ts        # Counterfact middleware (optional)
│   ├── pet.ts                 # handlers for /pet
│   ├── pet/
│   │   └── {petId}.ts         # handlers for /pet/{petId}
│   └── store/
│       └── order.ts
└── types/
    ├── index.ts              # public generated types
    └── paths/
        ├── pet.types.ts
        ├── pet/
        │   └── {petId}.types.ts
        └── store/
            └── order.types.ts
```

> **Note:** Files under `types/` are automatically regenerated whenever the OpenAPI spec changes. Never edit them by hand — your changes will be overwritten on the next regeneration.

Generated types preserve literal names and enum values, including escaped characters. Nested `allOf`, `anyOf`, and `oneOf` schemas retain their grouping. Unsupported schema type strings produce `unknown`; use standard OpenAPI types and `$ref` references for named schemas.

Schema types also preserve:

- OpenAPI 3.0 `nullable: true` on declared types and OpenAPI 3.1 type unions containing `null`. A required nullable property must still be present. Explicit `enum` and `const` constraints continue to restrict the allowed values.
- Primitive `const` values, such as `const: cat`, as literal types.
- Object properties when `type: object` is omitted, and typed dictionary values declared with `additionalProperties`, including `$ref` values. Unrestricted dictionary values remain `unknown`.
- Properties alongside composition keywords and required fields declared by a containing schema. Requiring a referenced model's field in one composed type does not change the shared model.
- Explicit discriminator mappings on referenced `oneOf` and `anyOf` branches, so checking the discriminator narrows the generated union. Multiple mapping values may select the same branch. OpenAPI 3.2 `defaultMapping` remains a fallback branch.
- Tuple positions declared with OpenAPI 3.1 `prefixItems` (or an array-valued `items`). `minItems` determines which prefix positions are required, `items: false` closes the tuple, and a schema-valued `items` types its remaining elements. Length constraints beyond the declared prefix are not encoded in the TypeScript type.

Generation does not replace runtime validation. TypeScript cannot express every JSON Schema constraint. In particular, `oneOf` is represented as a union rather than a guarantee that exactly one branch validates.

## Update a specification

With specification watching enabled, save the OpenAPI document to regenerate the enabled artifacts. Types reflect the updated contract; existing route implementations retain your edits. Use your editor or TypeScript checks to find handlers whose assumptions no longer match the specification.

New operations receive route scaffolding. If you want to remove obsolete route files, use `--prune` deliberately and review the resulting diff. Commit your specification and custom behavior so changes to the simulation can be reviewed together.

The `watch` generation options control responses to specification changes. Runtime hot reload of route files is separate. See [CLI configuration](../api/cli.md) and [hot reload](./hot-reload.md).

For a concrete change, expected diagnostic, and CI command, follow [Catch a contract change with TypeScript](../patterns/contract-change.md). Serving TypeScript does not substitute for that check.

## Explore a contract while designing it

Run `npx counterfact@latest openapi.yaml api --watch --serve` while editing a local contract. New required fields appear in generated sample responses; optional fields may be omitted unless `--always-fake-optionals` is enabled. Update fixed handlers and run an explicit TypeScript check after regeneration. The server continuing to run does not establish that custom handlers still match the contract.

## Central type exports

Import generated API types from `types/index.ts`:

```ts
// routes/pet/{petId}.ts
import type { Components, Routes, Schemas } from "../../types/index.js";

type Route = Routes["/pet"]["/{petId}"];
type Pet = Schemas["Pet"];
type SamePet = Components["schemas"]["Pet"];

export const GET: Route["GET"] = async ($) => {
  return $.response.status(200).random();
};
```

New route files declare a local `Route` alias for their path, even when they
contain only one operation. Each handler selects its method with `Route["GET"]`,
`Route["POST"]`, and so on. The alias is local to the file and is not exported.
Existing handler text is preserved during regeneration; newly added methods reuse
a matching local alias, or receive a new alias with a numeric suffix if `Route`
is already taken.

`Routes` is a tree of path segments. Each segment keeps its leading `/`, and
uppercase HTTP methods select the handler contract at that branch. A branch can
contain both operations on its own path and child branches: `/hello` and
`/hello/world` share the `Routes["/hello"]` branch.

For GET operations, the indexes are:

| OpenAPI path    | Handler type                             |
| --------------- | ---------------------------------------- |
| `/hello`        | `Routes["/hello"]["GET"]`                |
| `/hello/world`  | `Routes["/hello"]["/world"]["GET"]`      |
| `/pets/{petId}` | `Routes["/pets"]["/{petId}"]["GET"]`     |
| `/`             | `Routes["/"]["GET"]`                     |
| `/hello/world/` | `Routes["/hello"]["/world"]["/"]["GET"]` |

Each handler retains its typed inputs, context, and response builders. Parameter
segments use their literal names, such as `/{petId}`. A terminal slash is an
empty `/` segment, preserving the spec's original spelling; generated route
filenames still use Counterfact's normalized paths.

For an existing full-path annotation, split the path into segment indexes.
Regeneration preserves existing handler text, so update those annotations in
your code when adopting the tree.

`Components` maps the original OpenAPI component categories and names. `Schemas`
is an alias of `Components["schemas"]`. All declared components are included,
even when no operation references them. Absent categories are empty maps.

| Category                               | Generated representation                                                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `schemas`                              | The schema's data type                                                                                                                   |
| `parameters`, `headers`                | The value's schema type, or its content map when it uses `content`                                                                       |
| `responses`                            | Counterfact's response contract: `headers`, `requiredHeaders`, `content`, and `examples`; media entries expose their data under `schema` |
| `requestBodies`, `mediaTypes`          | The definition's structure, with embedded `schema` and `itemSchema` fields replaced by data types                                        |
| `examples`, `securitySchemes`, `links` | The definition's literal structure                                                                                                       |
| `callbacks`, `pathItems`               | The definition's structure, with embedded schemas replaced by data types                                                                 |

For example, access a JSON response body through
`Components["responses"]["NotFound"]["content"]["application/json"]["schema"]`.
Component maps describe types; they do not export runtime values or configure
server authentication, callbacks, or links.

Direct imports from generated operation and component modules are deprecated.
Import `Routes`, `Components`, and `Schemas` from `types/index.js` in new and
updated code. Existing deep imports continue to work for compatibility;
regeneration does not rewrite existing handler annotations to the new style.
`Context$`, `Scenario`, and `Scenario$` are direct exports of the same central
entry point. `Middleware` is a directory-indexed map: use `Middleware["/"]`
or `Middleware["/admin"]` for the matching route directory. Dedicated helper
imports are also deprecated and remain available for compatibility.
New route handlers use `Routes`; regeneration preserves existing handlers and
imports. Each configured API group has its own central entry point. For versions
in the same group, `Routes` uses the shared version-aware handler contracts and a
component with the same name in multiple versions is the union of those types.
Version-specific files remain compatibility surfaces; the central component maps
expose unions across versions.

## Context, scenario, and middleware types

Use the same central import for constructor helpers and scenarios:

```ts
// routes/_.context.ts
import type { Context$ } from "../types/index.js";

export class Context {
  constructor($: Context$) {
    void $;
  }
}
```

```ts
// scenarios/index.ts
import type { Scenario, Scenario$ } from "../types/index.js";

function initialize($: Scenario$): void {
  void $;
}

export const startup: Scenario = function ($) {
  initialize($);
};
```

These types are shared within an API group. `Context$` includes typed
`loadContext()` overloads, `readJson()`, and the shared `store` when configured.
`Scenario$` includes the root context, context lookups, and route-builder helpers.
It does not expose the shared store directly.

Middleware types vary by directory because each directory can have a different
nearest context. Select its directory path from `Middleware`:

```ts
// routes/admin/_.middleware.ts
import type { Middleware } from "../../types/index.js";

export const middleware: Middleware["/admin"] = async function ($, respondTo) {
  return respondTo($);
};
```

Use `Middleware["/"]` at the root. The map contains entries for directories in
the route tree and follows inherited contexts. Directory changes refresh the
map; editing a context updates the referenced type. See [middleware](./middleware.md).

## Multi-version APIs

First [configure versions in the same API group](./multiple-versions.md). Select the shared handler contract through `Routes`; it describes the possible request/response contracts and lets `$.minVersion()` select the applicable versions. The following handler assumes `GET /pets` declares a 200 response in v1 and v2.

When two or more versioned specs share an operation, its `Routes` entry describes
the supported versions. The import and annotation stay the same as for an
unversioned API:

```ts
// routes/pets.ts
import type { Routes } from "../types/index.js";

type Route = Routes["/pets"];

export const GET: Route["GET"] = function ($) {
  if ($.minVersion("v2")) {
    return $.response.status(200).random();
  }
  return $.response.status(200).random();
};
```

Counterfact combines each version's request arguments behind this entry point.
Use `$.minVersion("v2")` to narrow `$` to versions at or after `v2` in the
configured order and access their version-specific fields. You do not need to
import the internal versioned operation modules.

## See also

- [Routes](./routes.md) — writing route handlers, reading request data, building responses
- [State](./state.md) — sharing state across routes with context objects
- [Find your workflow](../usage.md)
