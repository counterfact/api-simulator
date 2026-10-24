# OpenAPI overlays

Use overlays when an upstream specification needs local examples or corrections for a simulation. Counterfact applies the changes while loading the document, leaving the source document untouched.

## Define and apply changes

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

## Maintain the overlay

Apply overlays in the intended order and review them when the upstream specification changes. JSONPath targets must still select the intended objects. Use an overlay to adapt the contract; use route handlers and contexts for runtime behavior.

See [CLI and configuration](../api/cli.md) for options.
