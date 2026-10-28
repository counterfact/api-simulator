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
    ├── index.ts              # Routes, Components, and Schemas
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

type Pet = Schemas["Pet"];
type SamePet = Components["schemas"]["Pet"];

export const GET: Routes["/pet/{petId}"]["GET"] = async ($) => {
  return $.response.status(200).random();
};
```

`Routes` maps the paths in your spec to their uppercase HTTP methods. Each entry
is the existing Counterfact handler contract, including typed inputs, context,
and response builders. Paths retain their original spelling, including trailing
slashes; generated route filenames still use Counterfact's normalized paths.

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

The individual files under `types/` remain available for existing imports.
New route handlers use `Routes`; regeneration preserves existing handlers and
imports. Each configured API group has its own central entry point. For versions
in the same group, `Routes` uses the shared version-aware handler contracts and a
component with the same name in multiple versions is the union of those types.
Version-specific files remain available when you need one version's component.

## Multi-version APIs

First [configure versions in the same API group](./multiple-versions.md). Handlers import a shared operation type; it describes the possible request/response contracts and lets `$.minVersion()` select the applicable versions. The generated type below illustrates how that works; you do not need to author it.

When two or more versioned specs share the same operation path (e.g. `GET /pets`), Counterfact emits a **version-mapped handler type** in the shared `types/paths/` file instead of a flat type.

```ts
// types/paths/pets.types.ts  (generated — do not edit)

import type { Versioned } from "../versions.js";
import type {
  MaybePromise,
  COUNTERFACT_RESPONSE,
} from "../../counterfact-types/index.js";
import type { HTTP_GET_$_v1 } from "../v1/paths/pets.types.js";
import type { HTTP_GET_$_v2 } from "../v2/paths/pets.types.js";

type HTTP_GET_$_Versions = { v1: HTTP_GET_$_v1; v2: HTTP_GET_$_v2 };

export type HTTP_GET = (
  $: Versioned<HTTP_GET_$_Versions>,
) => MaybePromise<COUNTERFACT_RESPONSE>;
```

Each version's strongly-typed `$` argument lives in its own subdirectory
(`types/v1/paths/pets.types.ts`, `types/v2/paths/pets.types.ts`). The shared
file imports and combines them via `Versioned<T>`, which resolves to the union
of the selected version argument types, with `version` and `minVersion()`
metadata. Use `$.minVersion("v2")` to narrow `$` to versions at or after `v2`
in the configured version order and access their version-specific fields.

When only a single (unversioned) spec is configured the output is unchanged
from the flat-type format.

## See also

- [Routes](./routes.md) — writing route handlers, reading request data, building responses
- [State](./state.md) — sharing state across routes with context objects
- [Find your workflow](../usage.md)
