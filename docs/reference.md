# Reference

Complete reference for Counterfact's architecture, route handlers, and CLI.

---

## Contents

- [Architecture overview](#architecture-overview)
- [Generated file structure](#generated-file-structure)
- [Route handlers](#route-handlers)
- [The `$` parameter](#the--parameter)
- [Response builder methods](#response-builder-methods)
- [State management](#state-management)
- [Hot reload](#hot-reload)
- [Live REPL](#live-repl)
- [Hybrid proxy](#hybrid-proxy)
- [Middleware](#middleware)
- [Type safety](#type-safety)
- [Programmatic API](#programmatic-api)
- [Multiple API versions](#multiple-api-versions)
- [CLI reference](#cli-reference)

---

## Architecture overview

```
OpenAPI spec (YAML or JSON, local or URL)
        │
        ▼
┌──────────────────────┐
│ TypeScript Generator │  → routes/  (one .ts per path)
│                      │  → types/   (request/response interfaces)
└──────────────────────┘
        │
        ▼
┌──────────────────────┐
│  Koa HTTP Server     │  → dispatches requests to route handlers
│  + Hot Reload        │  → watches for file changes via chokidar
│  + REPL              │  → interactive terminal attached to live state
│  + Proxy             │  → optional passthrough to a real backend
└──────────────────────┘
```

---

## Generated file structure

```
<output-directory>/
├── routes/
│   ├── _.context.ts           # shared in-memory state (optional)
│   ├── _.middleware.ts        # custom Koa middleware (optional)
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

---

## Route handlers

Every generated route file exports a named function per HTTP method. The function receives a single `$` parameter that exposes everything from the request and a response builder typed to the spec.

### Default: random schema-valid response

```ts
// routes/pet/{petId}.ts
import type { HTTP_GET } from "../../types/paths/pet/{petId}.types.js";

export const GET: HTTP_GET = ($) => {
  return $.response[200].random();
};
```

### Custom response

```ts
export const GET: HTTP_GET = ($) => {
  const pet = db.find($.path.petId);
  if (!pet) return $.response[404].text(`Pet ${$.path.petId} not found`);
  return $.response[200].json(pet);
};
```

Counterfact handles content negotiation automatically. Calling `.json(content)` will also serve the same data as XML when the client sends `Accept: application/xml`.

### Named OpenAPI example

```ts
export const GET: HTTP_GET = ($) => {
  return $.response[200].example("fullPet");
  //                              ^ autocompleted from your spec
};
```

---

## The `$` parameter

| Property | Type | Description |
| --- | --- | --- |
| `$.path` | typed object | Path parameters from the URL |
| `$.query` | typed object | Query string parameters |
| `$.querystring` | typed object | Entire query string as a single typed object (OpenAPI 3.2 `in: querystring` parameters) |
| `$.headers` | typed object | Request headers |
| `$.body` | typed object | Parsed request body |
| `$.context` | `Context` instance | Shared state for this route subtree |
| `$.response[N]` | response builder | Fluent builder for HTTP status code N (e.g. `$.response[200]`, `$.response[404]`) |

---

## Response builder methods

`$.response[N]` (where N is the HTTP status code) returns a fluent builder. Chain one or more of these methods:

| Method | Description |
| --- | --- |
| `.random()` | Random data generated from the OpenAPI schema (uses `examples` where available) |
| `.example(name)` | A specific named example from the OpenAPI spec |
| `.empty()` | Explicitly returns a response with no body (use for 204 No Content and similar) |
| `.json(content)` | JSON body (also converts to XML automatically when the client requests it) |
| `.text(content)` | Plain-text body |
| `.html(content)` | HTML body |
| `.xml(content)` | XML body |
| `.match(contentType, content)` | Body with an explicit content type; chain multiple for content negotiation |
| `.header(name, value)` | Adds a response header |
| `.cookie(name, value, options?)` | Adds a `Set-Cookie` header |

```ts
return $.response[200]
  .header("x-request-id", "abc123")
  .cookie("session", "xyz", { httpOnly: true })
  .json({ ok: true });
```

---

## State management

Create a `_.context.ts` file anywhere in the routes tree. All route files in the same directory (and below) share the same `Context` instance.

```ts
// routes/_.context.ts
import type { Pet } from "../types/components/pet.types.js";

export class Context {
  private pets = new Map<number, Pet>();
  private nextId = 1;

  add(pet: Omit<Pet, "id">): Pet {
    const id = this.nextId++;
    const created = { ...pet, id };
    this.pets.set(id, created);
    return created;
  }

  get(id: number): Pet | undefined {
    return this.pets.get(id);
  }

  list(): Pet[] {
    return [...this.pets.values()];
  }

  remove(id: number): boolean {
    return this.pets.delete(id);
  }
}
```

### Cross-context communication with `loadContext()`

Route handlers can reach into a _different_ subtree's context using the `loadContext(path)` function injected into every handler. This lets sibling or parent routes share data without merging everything into one big context.

```ts
// routes/payments/{id}.ts
export const GET: HTTP_GET = ($) => {
  // Load the context that owns /users, even though this route lives under /payments
  const usersContext = $.loadContext("/users") as import("../users/_.context.js").Context;
  const user = usersContext.getById($.query.userId);
  if (!user) return $.response[404].text("User not found");
  return $.response[200].json({ paymentId: $.path.id, user });
};
```

---

## Hot reload

Counterfact watches the routes directory with [chokidar](https://github.com/paulmillr/chokidar). When you save a route file:

1. The module is re-imported.
2. The handler is swapped in the registry.
3. The `Context` instance **is preserved** — in-memory data survives the reload.

No restart required.

---

## Live REPL

The REPL runs in the terminal alongside the server. It connects directly to the live `Context` and route registry.

```
⬣> context.list()
[ { id: 1, name: 'Fluffy', status: 'available' } ]

⬣> context.add({ name: 'Rex', photoUrls: [], status: 'pending' })
{ id: 2, name: 'Rex', photoUrls: [], status: 'pending' }

⬣> client.get("/pet/1")
{ status: 200, body: { id: 1, name: 'Fluffy', status: 'available' } }

⬣> .proxy on /payments    # forward /payments/* to the real API
⬣> .proxy off             # disable all proxying
```

---

## Hybrid proxy

Forward specific paths to a real backend while mocking the rest. Useful when only part of an API exists yet, or when you want to replace a few endpoints with custom behavior.

```sh
npx counterfact@latest openapi.yaml api --proxy-url https://api.example.com
```

Toggle individual paths at runtime from the REPL (see above).

---

## Middleware

Drop a `_.middleware.ts` file into any routes subdirectory to inject Koa middleware for all routes in that subtree.

```ts
// routes/_.middleware.ts
import type { Middleware } from "koa";

const middleware: Middleware = async (ctx, next) => {
  ctx.set("x-powered-by", "counterfact");
  await next();
};

export default middleware;
```

---

## Type safety

Route handler types are generated directly from the OpenAPI spec. When you regenerate after a spec change, TypeScript surfaces every handler that no longer matches the contract — at compile time, before anything breaks in production.

```ts
// This will fail to compile if status 200 no longer exists
// or if the response body shape changes.
export const GET: HTTP_GET = ($) => {
  return $.response[200].json({ id: $.path.petId, name: "Fluffy" });
};
```

OpenAPI descriptions are preserved as JSDoc comments on generated types, so they appear inline in your editor as you type.

---

## Programmatic API

Import `counterfact` and call it directly instead of using the CLI:

```ts
import { counterfact } from "counterfact";

await counterfact("openapi.yaml", "api", { port: 4000, serve: true });
```

---

## Multiple API versions

### `SpecConfig.version`

The optional `version` field on a spec entry declares the version label for that spec (e.g. `"v1"`, `"v2"`).

When combined with `group` and no explicit `prefix`, the server mounts the spec's routes under `/<group>/<version>`. When omitted, routes are mounted under `/<group>`.

When at least one spec in a group declares a non-empty `version`, Counterfact generates `types/versions.ts` inside that group's subdirectory with the `Versions`, `VersionsGTE`, and `Versioned` types.

Version order is determined by the order of entries in the config — the first entry with a given group is the oldest version.

### `Versioned<T, V>`

The `Versioned` type is the type of the `$` argument in a versioned route handler. It is generated into `<basePath>/<group>/types/versions.ts` and is already used by the generated `HTTP_GET` (and other) handler types — you do not need to import it directly.

```ts
export type Versioned<
  T extends Partial<Record<Versions, object>>,
  V extends keyof T & Versions = keyof T & Versions,
> = T[V] & {
  version: V;
  minVersion<M extends keyof T & Versions>(
    min: M,
  ): this is Versioned<T, Extract<V, VersionsGTE[M]>>;
};
```

| Member | Description |
|--------|-------------|
| `T` | Map from version string to the `$`-arg type for that version |
| `V` | Union of currently active version keys (defaults to all keys of `T`) |
| `version` | The version string for the current request (e.g. `"v2"`) |
| `minVersion(min)` | Type predicate; returns `true` when the current version is ≥ `min` in the declared order and narrows `$` accordingly |

### `Versions`

A union of all version strings declared for a group (e.g. `"v1" | "v2" | "v3"`). Generated into `types/versions.ts`.

### `VersionsGTE`

A mapped type that resolves, for each version, the set of versions that are greater than or equal to it. Used internally by `Versioned.minVersion()` to compute the narrowed type after a successful check.

### `types/versions.ts`

This file is auto-generated once per API group whenever at least one spec in that group declares a non-empty `version`. It lives at `<basePath>/<group>/types/versions.ts`.

It exports:

| Export | Description |
|--------|-------------|
| `Versions` | Union of all version strings for the group |
| `VersionsGTE` | Map from each version to the set of versions ≥ it |
| `Versioned<T, V>` | The `$`-arg type for versioned handlers |

> Do not edit this file — it is regenerated automatically.

See the [Multiple versions feature page](./features/multiple-versions.md) for a full walkthrough.

---

## CLI reference

```
npx counterfact@latest [spec] [output] [options]
```

| Flag | Default | Description |
| --- | --- | --- |
| `-p, --port <number>` | `3100` | HTTP server port |
| `-o, --open` | `false` | Open browser on start |
| `-g, --generate` | `false` | Generate all code (routes and types) |
| `-w, --watch` | `false` | Generate and watch all code for changes |
| `-s, --serve` | `false` | Start the server |
| `-r, --repl` | `false` | Start the REPL |
| `-b, --build-cache` | `false` | Build the cache of compiled routes and types |
| `--spec <path>` | _(positional arg)_ | Path or URL to the OpenAPI document |
| `--proxy-url <url>` | _(none)_ | Default upstream for the proxy |
| `--prefix <path>` | _(none)_ | Global path prefix (e.g. `/api/v1`) |
| `--no-validate-request` | — | Disable OpenAPI request validation |
| `--no-validate-response` | — | Disable OpenAPI response validation |
| `--generate-types` | `false` | Generate types only |
| `--generate-routes` | `false` | Generate routes only |
| `--watch-types` | `false` | Watch and regenerate types only |
| `--watch-routes` | `false` | Watch and regenerate routes only |
| `--always-fake-optionals` | `false` | Include optional fields in random responses |
| `--prune` | `false` | Remove route files that no longer exist in the spec |
| `--admin-api` | `false` | Enable the Admin API at `/_counterfact/api/*` |
| `--admin-api-token <token>` | _(none)_ | Bearer token required for Admin API endpoints |
| `--no-update-check` | — | Disable the npm update check on startup |
| `--config <path>` | `counterfact.yaml` | Path to a config file |

Run `npx counterfact@latest --help` for the full list.

---

## See also

- [Getting started](./getting-started.md)
- [Patterns](./patterns/index.md)
- [FAQ](./faq.md)
- [How it compares](./comparison.md)
- [Usage](./usage.md)
