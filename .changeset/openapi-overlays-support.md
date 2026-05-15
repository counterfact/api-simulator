---
"counterfact": minor
---

Add support for OpenAPI Overlays (v1.0.0). Overlays allow you to apply targeted modifications to an OpenAPI document without editing the original file.

- New `--overlay <path>` CLI flag (repeatable) applies overlay files in order before code generation and server startup.
- `SpecConfig` now accepts an `overlays?: string[]` field for programmatic use and multi-spec config files.
- Each overlay file is a YAML/JSON document with an `overlay` version field and an `actions` array. Each action targets nodes with a JSONPath expression and either merges an `update` object or removes matched nodes.
- Overlays are applied to both the code-generator pipeline (`Specification.fromFile`) and the runtime server pipeline (`OpenApiDocument.load`).
- The new `applyOverlays` / `applyOverlayActions` / `loadOverlay` utilities are exported from `src/util/apply-overlay.ts`.

Example overlay file (`my-overlay.yaml`):

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

Usage:

```bash
counterfact openapi.yaml ./out --overlay my-overlay.yaml
```
