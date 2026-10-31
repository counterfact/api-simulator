# Multiple API Versions

Counterfact can serve several versions of the same API simultaneously from a single running process. Each version can have its own URL prefix, generated types, and route handler invocation — while all versions share the same route files.

---

## Contents

- [YAML config syntax](#yaml-config-syntax)
- [URL layout](#url-layout)
- [Generated code layout](#generated-code-layout)
- [Writing versioned route handlers](#writing-versioned-route-handlers)
- [REPL usage](#repl-usage)
- [TypeScript narrowing with `Versioned`](#typescript-narrowing-with-versioned)

---

## YAML config syntax

An [API group](../manual/concepts.md#api-groups-versions-and-url-prefixes) collects specs that share route files and context state. `basePath` names the library’s output directory (`destination` in the CLI YAML config); a named group lives in a subdirectory of it. A `version` labels a contract within that group; only `prefix` changes URLs.

Declare multiple specs in `counterfact.yaml` using the `spec` array. Give them the same `group` and different `version` labels:

```yaml
# counterfact.yaml
destination: api
spec:
  - source: ./openapi-v1.yaml
    group: catalog
    version: v1
    prefix: /api/v1
  - source: ./openapi-v2.yaml
    group: catalog
    version: v2
    prefix: /api/v2
  - source: ./openapi-v3.yaml
    group: catalog
    version: v3
    prefix: /api/v3
```

| Field     | Required | Description                                                                                                                               |
| --------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `source`  | yes      | Path or URL to the OpenAPI document                                                                                                       |
| `group`   | yes      | Subdirectory name under `basePath`; must be non-empty and unique across groups (not across versions of the same group)                    |
| `version` | yes      | Version label (e.g. `"v1"`, `"v2"`) used by generated types and `$.minVersion()`.                                                         |
| `prefix`  | no       | URL prefix prepended to paths in the spec. Omitted prefixes default to `""`; use distinct values when versions declare overlapping paths. |

> **Note:** Version order matters. The first entry with a given `group` is treated as the **oldest** version. `$.minVersion()` compares against this declared order.

---

## URL layout

With the configuration above, Counterfact mounts the three specs at:

```
http://localhost:3100/api/v1/...
http://localhost:3100/api/v2/...
http://localhost:3100/api/v3/...
```

All three effective prefixes come from the explicit `prefix` fields. `group`
controls the generated directory and shared state, while `version` controls
versioned types. Neither field changes the URL. If `prefix` is omitted, paths
remain at the root exactly as declared in the OpenAPI document.

```yaml
spec:
  - source: ./openapi-v1.yaml
    group: catalog
    version: v1
    prefix: /legacy/v1
```

If that spec declares `/items`, its effective URL is `/legacy/v1/items`.

---

## Generated code layout

For each group with at least one versioned spec, Counterfact generates the following layout:

```
<basePath>/
└── catalog/
    ├── routes/
    │   ├── _.context.ts             # shared state for the whole group
    │   └── items/
    │       └── {itemId}.ts          # one handler file, shared across all versions
    └── types/
        ├── index.ts                 # Routes, Components, and Schemas
        ├── paths/                   # internal shared operation contracts
        │   └── items/
        │       └── {itemId}.types.ts
        ├── v1/                      # per-version $ arg types (auto-generated)
        │   └── paths/
        │       └── items/
        │           └── {itemId}.types.ts
        ├── v2/
        │   └── paths/ ...
        ├── v3/
        │   └── paths/ ...
        └── versions.ts              # Versions, VersionsGTE, and Versioned types
```

Key points:

- **`routes/`** is shared. A single handler file serves every version.
- **`types/index.ts`** exports `Routes`, `Components`, and `Schemas`. Import `Routes`, define `type Route = Routes["/items"]["/{itemId}"]`, and select an operation with `Route["GET"]`; the entry combines all versions of that handler. Same-named components across versions are unions in `Components` and `Schemas`.
- **`types/paths/`** and **`types/<version>/paths/`** hold internal shared and per-version operation definitions. Direct imports from these modules are deprecated; use the central entry point.
- **`types/versions.ts`** exports `Versions`, `VersionsGTE`, and `Versioned`. It is generated once per group and re-generated whenever the set of versions changes.

> **Never edit files under `types/`** — they are regenerated automatically when the spec changes.

---

## Writing versioned route handlers

A handler file lives under `routes/` and is shared by all versions. Counterfact injects two version-aware helpers into the `$` argument at runtime:

| Property            | Type           | Description                                                                        |
| ------------------- | -------------- | ---------------------------------------------------------------------------------- |
| `$.version`         | `Versions`     | The version string for the request currently being handled (e.g. `"v1"`, `"v2"`)   |
| `$.minVersion(min)` | type predicate | Returns `true` when the current version is at or after `min` in the declared order |

Both properties are only present when `version` is set in the config. For a single unversioned spec they are absent.

### Example

This handler assumes a catalog context you write with `findById(id)`, returning items with `id`, `name`, and `category`. Declare the shown response shapes and text 404 in each version’s contract. See [stateful contexts](./state.md) for how to author that class.

```ts
// catalog/routes/items/{itemId}.ts
import type { Routes } from "../../types/index.js";

type Route = Routes["/items"]["/{itemId}"];

export const GET: Route["GET"] = function ($) {
  const item = $.context.findById($.path.itemId);
  if (!item) return $.response.status(404).text("Item not found");

  // v1: return only id and name
  if ($.version === "v1") {
    return $.response.status(200).json({ id: item.id, name: item.name });
  }

  // v2: also include the category field
  if ($.version === "v2") {
    return $.response.status(200).json({
      id: item.id,
      name: item.name,
      category: item.category,
    });
  }

  // v3+: return the full object
  return $.response.status(200).json(item);
};
```

Checking `$.version` selects an exact contract before constructing a version-specific response. Later versions reach the final branch; add another explicit branch when a new version needs different behavior.

---

## REPL usage

When running multiple APIs in one process, the REPL groups state by API group:

```js
// Access context for the catalog group
context.catalog;

// Access routes for the catalog group
routes.catalog;
```

`loadContext` and `route` are similarly grouped:

```js
loadContext.catalog("/items");
route.catalog("/items/{itemId}");
```

---

## TypeScript narrowing with `Versioned`

For the following example, v2 adds a required string `category` query parameter and
includes it in the JSON response. `$.minVersion()` is a TypeScript type predicate. After a successful check, TypeScript narrows `$` to the request arguments for the versions that satisfy the minimum:

```ts
import type { Routes } from "../../types/index.js";

type Route = Routes["/items"]["/{itemId}"];

export const GET: Route["GET"] = function ($) {
  if ($.minVersion("v2")) {
    // $ is typed as the v2 (and later) $ arg — v2-only fields are available here
    return $.response.status(200).json({
      id: $.path.itemId,
      category: $.query.category,
    });
  }

  // Return a schema-valid sample for versions before v2.
  return $.response.status(200).random();
};
```

This narrowing is powered by the `Versioned<T, V>` type in `types/versions.ts`. You do not need to import or use it directly — the operation contracts selected through `Routes` already use it as the type of `$`.

### Early returns narrow the remaining versions

A literal threshold narrows both outcomes. If v1 returns `{ message: string }`
and v2 requires an additional `locale` field, this handler is fully typed:

```ts
// routes/greeting.ts
import type { Routes } from "../types/index.js";

type Route = Routes["/greeting"];

export const GET: Route["GET"] = async ($) => {
  if ($.minVersion("v2")) {
    return $.response.status(200).json({ message: "x", locale: "en" });
  }

  return $.response.status(200).json({ message: "x" });
};
```

After the v2 branch returns, `$` and its response builder describe v1. Negated
checks and explicit `else` branches narrow the same way. With more versions,
checking newer versions first lets successive early returns narrow the
remaining contracts.

When the threshold itself has a union type, such as `"v2" | "v3"`,
`minVersion()` returns a boolean without narrowing. The runtime comparison still
works, but the compiler cannot use one fixed boundary to exclude versions from
the other branch. Use literal checks when you need version-specific inputs or
response shapes.

### The `Versioned` type

`Versioned<T, V>` is the type of the `$` argument in a versioned handler. It has two generic parameters:

| Parameter | Description                                                                                  |
| --------- | -------------------------------------------------------------------------------------------- |
| `T`       | A map from version string to the `$`-arg type for that version (e.g. `{ v1: $v1, v2: $v2 }`) |
| `V`       | The union of currently active version keys (defaults to all keys of `T`)                     |

It exposes:

- **A discriminated union of `T[V]`** — each selected version retains its own inputs and response builders.
- **`version: V`** — the current version string at runtime.
- **`minVersion(min)`** — a literal threshold narrows `$` to versions at or after `min` when true and the remaining versions when false. A dynamic union threshold uses the boolean overload.

---

## See also

- [Reference: `version` field and `Versioned` type](../api.md)
- [REPL](./repl.md) — interactive terminal for runtime inspection
- [Generated code](./generated-code.md) — how code generation works
- [Find your workflow](../usage.md)
