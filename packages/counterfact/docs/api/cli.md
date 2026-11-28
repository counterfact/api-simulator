# CLI and configuration

```
npx counterfact@latest [spec] [output] [options]
```

| Flag                        | Default            | Description                                                           |
| --------------------------- | ------------------ | --------------------------------------------------------------------- |
| `-p, --port <number>`       | `3100`             | HTTP server port                                                      |
| `-o, --open`                | `false`            | Open browser on start                                                 |
| `-g, --generate`            | `false`            | Generate all code (routes and types)                                  |
| `-w, --watch`               | `false`            | Generate and watch all code for changes                               |
| `-s, --serve`               | `false`            | Start the server                                                      |
| `-r, --repl`                | `false`            | Start the REPL                                                        |
| `-b, --build-cache`         | `false`            | Build the cache of compiled routes and types                          |
| `--spec <path>`             | _(positional arg)_ | Path or URL to the OpenAPI document                                   |
| `--overlay <path>`          | _(none)_           | Path or URL to an OpenAPI overlay file (repeatable; applied in order) |
| `--proxy-url <url>`         | _(none)_           | Default upstream for the proxy                                        |
| `--prefix <path>`           | _(none)_           | Global path prefix (e.g. `/api/v1`)                                   |
| `--no-validate-request`     | —                  | Disable OpenAPI request validation                                    |
| `--no-validate-response`    | —                  | Disable OpenAPI response validation                                   |
| `--generate-types`          | `false`            | Generate types only                                                   |
| `--generate-routes`         | `false`            | Generate routes only                                                  |
| `--generate-client`         | `false`            | Generate only a Fetch client into `[output]`                             |
| `--generate-schemas-only`   | `false`            | Write only the schema types into `[output]` (see below)               |
| `--watch-types`             | `false`            | Watch and regenerate types only                                       |
| `--watch-routes`            | `false`            | Watch and regenerate routes only                                      |
| `--always-fake-optionals`   | `false`            | Include optional fields in random responses                           |
| `--prune`                   | `false`            | Remove route files that no longer exist in the spec                   |
| `--admin-api`               | `false`            | Enable the Admin API at `/_counterfact/api/*`                         |
| `--admin-api-token <token>` | _(none)_           | Bearer token required for Admin API endpoints                         |
| `--no-update-check`         | —                  | Disable the npm update check on startup                               |
| `--config <path>`           | `counterfact.yaml` | Path to a config file                                                 |

The action flags above default to false individually. When no action flag is supplied, the CLI enables generation, watching, serving, the REPL, and cache building together. Supplying an action flag selects the requested actions. CLI values override values loaded from `counterfact.yaml` or `--config`.

Run `npx counterfact@latest --help` for the full list.

## Generate only the schema types

```sh
npx counterfact@latest openapi.yaml ./schemas --generate-schemas-only
```

`--generate-schemas-only` writes the schema types and nothing else: no routes, scenarios, helper types, `types/index.ts`, `.cache`, or server. It needs an explicit `[output]` directory and an OpenAPI 3.x document (Swagger 2.0 is rejected).

It cannot be combined with `--generate`, `--generate-routes`, `--generate-types`, `--watch*`, `--serve`, `--repl`, `--build-cache`, or `--prune`. If your config file sets any of these, they are ignored with a notice.

Output layout:

| Spec                  | Output                                 |
| --------------------- | -------------------------------------- |
| single spec           | `<output>/<Name>.ts`                   |
| `group`               | `<output>/<group>/<Name>.ts`           |
| `version`             | `<output>/<version>/<Name>.ts`         |
| `group` and `version` | `<output>/<group>/<version>/<Name>.ts` |

Groups and versions come from the `spec` list in a config file. Every spec in a multi-spec configuration needs a unique non-empty group, and one group cannot mix versioned and unversioned specs. A schema that depends on something other than another schema (for example a `$ref` to a parameter) fails with an error naming the schema, because the flat file could not import it.

## Generate a typed Fetch client

For Swagger 2.0 and OpenAPI 3.x, normal type generation includes a Fetch client. For
example, `npx counterfact@latest openapi.yaml ./api` generates
`./api/client/index.ts` alongside the simulator files. Spec watching
regenerates the client when type generation is enabled. Grouped APIs place
clients in each group directory, and versioned clients have an additional
version directory under `client/`.

To generate just the client, run:

```sh
npx counterfact@latest openapi.yaml ./src/api/generated --generate-client
```

Install `@counterfact/client` in the application that uses the generated
client. Import `createClient` from the generated entry point and set
`baseUrl` to the backend or Counterfact simulator, including any API prefix.

```ts
import { createClient } from "./api/client/index.js";

const route = createClient({ baseUrl: "http://localhost:3100" });
const tenant = route("/{tenantId}/v1").path({ tenantId: "acme" });
const order = tenant.segment("orders/{orderId}").method("get");
const result = await order.path({ orderId: "123" }).send();

if (result.matchedStatus === "200") {
  console.log(result.body);
}
```

`route()` accepts an OpenAPI path or one of its prefixes. `segment()` appends a
relative fragment and carries over the path values you already set. After
selecting a method, supply the operation's path, query, header, cookie, and body
inputs. The typed builder exposes `send()` once all required inputs are set.
Each step returns a new builder, so you can reuse a prefix or a prepared request.

### Pass the whole query string

For an OpenAPI 3.2 operation with an `in: querystring` parameter, pass its
complete value to `.query()`. The client takes the input type and encoding
from the parameter's `content`. A later `.query()` call replaces the earlier
value. If the parameter is required, supply it before calling `.send()` or
`.stream()`.

```ts
await route("/search").method("get")
  .query({ term: "red shoes", tags: ["sale", "women"] })
  .send();
```

Form encoding sends `?term=red+shoes&tags=sale&tags=women`. JSON encoding sends
the percent-encoded JSON value as the whole query string. The whole-query
value replaces any query in `baseUrl`. Use a header or cookie security scheme
for JSON whole-query requests.

The generated client supports JSON and URL-encoded form objects with
named fields. The simulator exposes the parsed form fields through
`$.querystring`. Positional and nested form encodings are outside the
client's support.

### Read the response

`send()` resolves with the HTTP `status`, `matchedStatus`, `mediaType`,
decoded `body`, and original Fetch `response`. Check `matchedStatus` to
narrow the body for a declared status, range, or default response. A documented
HTTP error such as a 404 also resolves when it matches the contract.

An unexpected response rejects with `InvalidResponseError`, exported from
`@counterfact/client/fetch`. The error includes a `reason`, the original
`response`, and the matched status declaration if there is one. For malformed
JSON or schema failures, it also exposes the received body as `unknown`.

The client validates declared JSON and text body schemas at runtime.
For other media types it checks the declared status and media type before
returning bytes. Validation covers the response body, excluding headers and
custom schema formats. Counterfact compiles the validators during generation,
so browser clients can validate responses under a Content Security Policy that
blocks dynamic code evaluation.

### Stream a download

A completed fluent request exposes `stream()` when the operation declares a
response that `send()` would return as bytes. Call it with the same request
options as `send()`.

```ts
const result = await route("/report").method("get").stream({ signal });

if (result.matchedStatus === "200") {
  const reader = result.body.getReader();
  // Read report bytes as they arrive.
}
```

The result preserves the status, media type, and original Fetch response. For
a byte response, `result.body` is the same stream as `result.response.body`.
Read from one of them. Declared JSON and text responses, such as error bodies,
are still decoded and validated.

### Authentication and Fetch options

Register providers by the names in `components.securitySchemes`. Counterfact
passes the scopes from the selected security requirement and the request's
abort signal to the provider. A provider may return a value or a promise.

```ts
const route = createClient({
  baseUrl: "https://api.example.com",
  auth: {
    userToken: ({ scopes, signal }) => session.getAccessToken(scopes, signal),
    tenantKey: () => config.apiKey,
  },
});

await route("/orders").method("get").send({ authenticate: true, signal });
```

An operation inherits top-level security unless it declares its own.
`security: []` makes the operation public. A request can satisfy any one
security alternative, and it needs every scheme within that alternative.
The client supports bearer tokens, OAuth 2.0 and OpenID Connect access
tokens, and API keys in headers or query parameters. For a cookie scheme,
a provider can return `{ credentials: "include" }` or
`{ credentials: "same-origin" }` to use browser-managed cookies.

- Omit `authenticate` to try the declared credential alternatives in order.
  If no complete alternative is available and the operation allows anonymous
  access, the client sends anonymously.
- Set `authenticate: true` to require credentials. A missing credential
  rejects before Fetch runs.
- Set `authenticate: false` to opt out. An operation requiring credentials
  rejects before Fetch runs. Otherwise the client omits browser credentials
  and removes authentication headers and declared API keys from the request.

Returning `undefined` from a provider lets the client try another alternative.
A thrown provider error rejects the request. A documented HTTP 401 remains a
typed response, with no anonymous retry.

Supply default headers, credentials, or a custom `fetch` in `createClient()`.
Each call to `send()` or `stream()` can set `signal`, `credentials`, and `redirect`.
Per-request credentials override the client default. Anonymous opt-out
always omits credentials. Requests that use a credential provider reject
redirects by default. Set a redirect mode explicitly to override that default.

Use a dedicated output folder for generated files. Grouped and versioned
specifications produce separate entry points under
`<output>/<group>/<version>/index.ts`, omitting either directory when it is not
configured. This one-shot mode applies configured overlays and does not start
the simulator. It uses the same action restrictions as schema-only generation,
and the two modes are mutually exclusive.

A request body uses the declared JSON media
type if there is one, or the first media type otherwise. JSON bodies use
generated schema types. Text, binary, and URL-encoded bodies use `string`,
`Blob | ArrayBuffer`, and `URLSearchParams` respectively.

For an OpenAPI 3.x multipart body, pass an object typed from the schema or a
prepared `FormData`. File fields accept `File`, `Blob`, or `Uint8Array`. Array
items are sent as separate parts under the same field name. Object parts use
`application/json` by default. Use `encoding.<field>.contentType` to set a
part's media type. For an image field declared as `image/*`, pass a
`File` or `Blob` with a concrete type such as `image/png`. For custom
serialization such as an XML part, pass
prepared `FormData` directly.
Response decoding supports exact declared media types, with non-JSON,
non-text content returned as bytes. Fetch-forbidden HTTP methods are omitted
from the generated client.

### Swagger 2.0

Swagger 2.0 clients use `definitions` for models, `consumes` for request
media types, and `produces` for response media types. Operation-level media
types override document defaults. With no media type declared, the generator
uses JSON for schema bodies, bytes for file responses, and the appropriate form
encoding for form data.

The fluent client and named SDK honor `collectionFormat` for arrays. Pass a
typed object for Swagger form fields, or supply a prepared `FormData` or
`URLSearchParams` object. A multipart file field accepts a `Blob` or `File`.
For Basic authentication, the provider returns a username and a password:

```ts
const api = createSdk({
  auth: {
    basicAuth: () => ({ username, password }),
  },
});
```

Use the security scheme name from `securityDefinitions` as the key. API key
and OAuth 2.0 providers work the same way as they do for OpenAPI 3.x.
The default URL comes from the Swagger document's `schemes`, `host`, and
`basePath`. Pass `baseUrl` to override it or when generation from a local
document has no host.

### Named SDK

Import `createSdk` from the same generated entry point. It accepts the same
client configuration as `createClient`.

```ts
import { createSdk } from "./api/client/index.js";

const api = createSdk({ baseUrl: "http://localhost:3100" });
const result = await api.users.getUser(42);

if (result.matchedStatus === "200") {
  console.log(result.body);
}
```

Methods use `operationId` when present. For example, a GET on
`/users/{id}` with no operation ID becomes `api.users.usersDetail(id)`.
Groups default to the first path segment. Use `--module-name-index <index>`
(or `moduleNameIndex` in `counterfact.yaml`) to select a zero-based segment.
Use `--module-name-first-tag` (or `moduleNameFirstTag`) to prefer the first
OpenAPI tag, falling back to the selected path segment for untagged operations.

Path arguments follow their order in the path. The final argument holds
`query`, `headers`, `cookies`, `body`, and request options, as applicable.
It is required when the operation has required inputs in those locations.
Responses use the same validated result contract as fluent `send()`. Named
methods that declare byte responses also expose `.stream()` with the same
arguments.

### Migrating from swagger-typescript-api

Install `swagger-typescript-api-adapter` and apply it to the generated SDK
factory:

```ts
import { createSdk } from "./api/client/index.js";
import { wrapSta } from "swagger-typescript-api-adapter";

const Api = wrapSta(createSdk);
const api = new Api({ baseUrl: "https://api.example.com" });
const { data } = await api.users.getUser(42);
```

If your STA Fetch client used `--single-http-client`, import `HttpClient` from
the adapter package and continue passing the instance to `new Api(http)`.
To keep body-only responses, use `wrapSta(createSdk, { unwrapResponseData: true })`.

## YAML configuration

Save `counterfact.yaml` in the directory where you run the CLI, or select another file with `--config <path>`. For example:

```yaml
spec: ./openapi.yaml
destination: ./api
port: 3100
validate-request: false
validate-response: true
update-check: false
```

This assumes `openapi.yaml` exists beside the config. Run `npx counterfact@latest` from that directory to generate, watch, and serve it with the REPL. To run only selected actions, set their keys explicitly, such as `generate: true` for a generation-only run.

- Use long option names without `--`. Both kebab-case and camelCase keys work: `validate-request` and `validateRequest` are equivalent.
- For a negative flag, use the positive key with `false`: `--no-validate-request` becomes `validate-request: false`, and `--no-update-check` becomes `update-check: false`.
- `destination` supplies the positional output directory. Relative paths are resolved from the working directory where the CLI runs, including when `--config` points elsewhere.
- Explicit CLI options override config values. An explicit positional output directory overrides `destination`. Unknown option keys are ignored; check spelling if a setting has no effect.

For multiple specifications, `spec` can be a list of entries; see [multiple APIs](../manual/multiple-apis.md).

## First-run intro

Running with no arguments and no `counterfact.yaml` starts an interactive intro.
Even an empty config file bypasses the intro, as does any explicit CLI argument.
The opening menu offers your own OpenAPI document (the default) and
documentation. Local discovery starts only when you choose your
own document; you can also enter a path or HTTP(S) URL. Setup asks for an output
directory (default: `api/`) and an available port (default: `3100`).

Port availability checks are advisory; another process can claim the selected
port before startup.

Discovery recognizes YAML/JSON root documents for Swagger 2.0 and OpenAPI 3.0,
3.1, and 3.2; it ignores malformed files, ordinary config, and schema fragments.
It does not resolve references or make network requests until a spec is selected.
Hidden files/directories, symlinks, dependency directories (`node_modules`,
`bower_components`, `vendor`), and build/cache directories (`dist`, `build`,
`out`, `coverage`, `target`, `__pycache__`) are skipped. The search is limited to
8 directory levels, 10,000 entries, 1,000 candidate documents, 100 specs, and
2 MiB per document. It checks a 15-second time budget and cancellation between
filesystem operations and file reads; an active filesystem call or synchronous
JSON/YAML parse must finish before scanning can stop. Discovery runs in the CLI
process and checks paths against its starting directory. These checks are not a
filesystem sandbox and cannot prevent concurrent directory-replacement races.
Unreadable locations are skipped with a compact warning; search limits are
reported. Pass a spec explicitly to use a skipped document.
Normal startup reports loading errors for a selected spec or its references.

Enter accepts defaults. Use `q`, Ctrl+C, or Ctrl+D to cancel. The intro requires
TTY input and output and is disabled by `CI` (except `CI=false` or `CI=0`).
An unconfigured no-argument run in those environments prints documentation and
explicit-start examples, then exits successfully without starting a server,
REPL, watcher, or generation. Use `npx counterfact _` to start a spec-free mock.

## Startup output

Counterfact prints its version and a random tagline from its bundled collection.

On startup, Counterfact reports the real work it is doing: loading an OpenAPI
document, generating enabled artifacts, and preparing the mock runtime. Once
ready, it prints only the capabilities enabled for that run, such as the mock
server URL, Swagger UI URL, and active file watching. For versioned specs, each
Swagger UI link selects its version. See [Swagger UI](../manual/swagger-ui.md#supported-specs-and-versioned-documentation).

Interactive terminals show a spinner while each startup step is running. The
progress line clears when the step finishes, leaving its completed status.
Progress labels shorten to fit narrow terminals, and resizing clears any reflowed
progress rows. Notices written during a step appear after its spinner clears.
Redirected output keeps progress messages on separate lines without animation.

Interactive terminals use colour to distinguish progress, successful work,
links, warnings, and errors. Redirected output remains plain text, and setting
the `NO_COLOR` environment variable disables colour even in an interactive
terminal. Normal progress and readiness lines never print local OpenAPI or
output-directory paths.

## OpenAPI input and overlays

[OpenAPI Overlays](https://spec.openapis.org/overlay/v1.0.0.html) let you apply targeted modifications to an OpenAPI document without editing the original file. Counterfact loads overlay files, evaluates their JSONPath targets against the spec, and applies each action before code generation and server startup.

### Overlay file format

An overlay file is a YAML or JSON document with three top-level fields:

| Field     | Required | Description                                |
| --------- | -------- | ------------------------------------------ |
| `overlay` | ✓        | Overlay version string (must be `"1.0.0"`) |
| `info`    |          | Metadata (`title`, `version`)              |
| `actions` | ✓        | Ordered list of actions to apply           |

Each action has:

| Field    | Description                                        |
| -------- | -------------------------------------------------- |
| `target` | JSONPath expression selecting the nodes to act on  |
| `update` | Object deep-merged into each matched node          |
| `remove` | `true` to delete each matched node from its parent |

Example overlay (`my-overlay.yaml`):

```yaml
overlay: 1.0.0
info:
  title: My Overlay
  version: 1.0.0
actions:
  - target: $.info
    update:
      description: Patched by overlay
  - target: $.paths['/internal']
    remove: true
```

### CLI usage

Pass `--overlay` one or more times. Overlays are applied in the order they appear:

```bash
npx counterfact@latest openapi.yaml ./out --overlay base-overlay.yaml --overlay env-overlay.yaml
```

With `--watch`, changes to any local overlay reapply the complete ordered
overlay chain and update the running server. Remote HTTP(S) overlays are not
polled or watched.

### Programmatic usage

Pass `overlays` on each specification entry (`SpecConfig`) in the second argument to `counterfact()`. `basePath` is the output directory; an empty group uses the single-API flat layout. See [API groups](../manual/concepts.md#api-groups-versions-and-url-prefixes).

```ts
import { counterfact } from "counterfact";

await counterfact({ basePath: "api" }, [
  {
    source: "openapi.yaml",
    group: "",
    overlays: ["base-overlay.yaml", "env-overlay.yaml"],
  },
]);
```

### Config file usage (`counterfact.yaml`)

When using a config file with the `spec` key, add `overlays` to each spec entry:

```yaml
spec:
  - source: openapi.yaml
    group: ""
    overlays:
      - base-overlay.yaml
      - env-overlay.yaml
```

See [multiple APIs](../manual/multiple-apis.md) for the `spec` configuration list and [simulator lifecycle](./simulator.md) for library defaults. The CLI defaults to port 3100; the library defaults to port 8100.
