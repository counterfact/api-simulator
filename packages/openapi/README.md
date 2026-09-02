# `@counterfact/openapi`

Load, bundle, dereference, and apply ordered OpenAPI overlays without starting
the Counterfact server, generator, or REPL.

```ts
import {
  applyOverlays,
  bundleOpenApiDocument,
  loadOpenApiDocument,
} from "@counterfact/openapi";

const dereferenced = await loadOpenApiDocument("./openapi.yaml", [
  "./development.overlay.yaml",
]);
const bundled = await bundleOpenApiDocument("./openapi.yaml");

await applyOverlays(dereferenced, ["./local.overlay.yaml"]);
void bundled;
```

`loadOpenApiDocument` resolves references completely. Use
`bundleOpenApiDocument` when a consumer needs external references folded into
one document while retaining internal references. Overlay paths are applied in
the order provided.

`classifyOpenApiSource` distinguishes local inputs from parsed HTTP(S) URLs,
and `getLocalOpenApiSourcePaths` returns unique local watcher inputs while
excluding remote URLs and Counterfact's `_` sentinel. File URLs are normalized
to local paths; ordinary file names such as `httpspec.yaml` remain local.

See [`examples/load-local-spec.mjs`](./examples/load-local-spec.mjs) for a
complete public-import example.
