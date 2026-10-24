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
    └── paths/
        ├── pet.types.ts
        ├── pet/
        │   └── {petId}.types.ts
        └── store/
            └── order.types.ts
```

> **Note:** Files under `types/` are automatically regenerated whenever the OpenAPI spec changes. Never edit them by hand — your changes will be overwritten on the next regeneration.

Generated types preserve literal names and enum values, including escaped characters. Nested `allOf`, `anyOf`, and `oneOf` schemas retain their grouping. Unsupported schema type strings produce `unknown`; use standard OpenAPI types and `$ref` references for named schemas.

## Update a specification

With specification watching enabled, save the OpenAPI document to regenerate the enabled artifacts. Types reflect the updated contract; existing route implementations retain your edits. Use your editor or TypeScript checks to find handlers whose assumptions no longer match the specification.

New operations receive route scaffolding. If you want to remove obsolete route files, use `--prune` deliberately and review the resulting diff. Commit your specification and custom behavior so changes to the simulation can be reviewed together.

The `watch` generation options control responses to specification changes. Runtime hot reload of route files is separate. See [CLI configuration](../api/cli.md) and [hot reload](./hot-reload.md).

For a concrete change, expected diagnostic, and CI command, follow [Catch a contract change with TypeScript](../patterns/contract-change.md). Serving TypeScript does not substitute for that check.

## Explore a contract while designing it

Run `npx counterfact@latest openapi.yaml api --watch --serve` while editing a local contract. New required fields appear in generated sample responses; optional fields may be omitted unless `--always-fake-optionals` is enabled. Update fixed handlers and run an explicit TypeScript check after regeneration. The server continuing to run does not establish that custom handlers still match the contract.

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
