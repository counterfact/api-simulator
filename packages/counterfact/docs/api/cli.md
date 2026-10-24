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

## First-run intro

Running with no arguments and no `counterfact.yaml` starts an interactive intro.
Even an empty config file bypasses the intro, as does any explicit CLI argument.
The opening menu offers a guided example (the default), your own OpenAPI
document, and documentation. Local discovery starts only when you choose your
own document; you can also enter a path or HTTP(S) URL. Setup asks for an output
directory (default: `api/`) and an available port (default: `3100`).

For the bundled shop, editor controls, lesson progression, and recovery behavior,
see [Try the guided coffee shop](../manual/guided-example.md). Setup preserves
existing files, directories, and symlinks. Port availability checks are advisory;
another process can claim the selected port before startup.

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
server URL, Swagger UI URL, and active file watching.

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

Pass `overlays` on each `SpecConfig` entry:

```ts
import { counterfact } from "counterfact";

await counterfact(config, [
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
