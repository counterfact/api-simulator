# TypeScript Native Mode

By default Counterfact compiles your route files into a `.cache/` directory before loading them. When you run Counterfact under a TypeScript-aware runtime it detects this automatically and skips compilation, loading `.ts` source files directly. The result is the same hot-reload experience with no build step.

## How detection works

At startup Counterfact writes a small temporary TypeScript file to a system temp directory and attempts to import it. If the import succeeds the runtime is TypeScript-capable and the transpiler is skipped. No configuration is needed.

## With tsx

Invoke the `counterfact` binary through [tsx](https://tsx.is/):

```sh
# one-off via npx
npx tsx ./node_modules/counterfact/bin/counterfact.js openapi.yaml api --serve --watch

# or in package.json scripts
"mock": "tsx ./node_modules/counterfact/bin/counterfact.js openapi.yaml api --serve --watch"
```

tsx is available as a dev dependency (`npm install --save-dev tsx`).

## With plain Node.js

Node 22.6+ ships with `--experimental-strip-types`. A small module hook bundled with Counterfact (`bin/register-ts-loader.mjs`) adds the `.js` → `.ts` import remapping that Node doesn't do on its own:

```sh
node \
  --experimental-strip-types \
  --import ./node_modules/counterfact/bin/register-ts-loader.mjs \
  ./node_modules/counterfact/bin/counterfact.js \
  openapi.yaml api --serve --watch
```

In `package.json`:

```json
"scripts": {
  "mock": "node --experimental-strip-types --import ./node_modules/counterfact/bin/register-ts-loader.mjs ./node_modules/counterfact/bin/counterfact.js openapi.yaml api --serve --watch"
}
```

> **Note:** `--experimental-strip-types` is stable enough for development use but the flag name may change before it graduates from experimental status.

## What changes in native mode

|                     | Default (compiled)                     | Native TS                  |
| ------------------- | -------------------------------------- | -------------------------- |
| Startup             | Compiles routes to `.cache/` first     | Loads `.ts` files directly |
| `.cache/` directory | Created and managed automatically      | Not used                   |
| Dependencies        | None extra                             | tsx _or_ Node 22.6+        |
| Route file format   | Generated `.ts` files (same as always) | Same                       |
| Hot reload          | ✅                                     | ✅                         |

## See also

- [Hot reload](./hot-reload.md)
- [Reference](../reference.md) — CLI flags
- [Usage](../usage.md)
