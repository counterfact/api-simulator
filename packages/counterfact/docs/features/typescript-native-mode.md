# TypeScript Native Mode

Counterfact normally compiles authored route and context files into `.cache/`
before loading them. Its runtime can instead load `.ts` files directly when the
current process supports both erasable TypeScript syntax and `.js` imports that
resolve to the corresponding `.ts` files.

## How detection works

The probe writes a temporary TypeScript module that imports `helper.js`, while
only `helper.ts` exists. Importing that module must succeed and return the
expected value. Type stripping alone is not sufficient: `.js` → `.ts` resolution
must also work. When the probe succeeds, the runtime uses `routes/` rather than
`.cache/` and skips the transpiler; otherwise it follows the compiled path.

## Installed CLI: use the compiled path

For an npm-installed package, use the ordinary Counterfact CLI under its
supported Node.js versions (Node 22 or newer):

```sh
npx counterfact@latest openapi.yaml api --serve --watch
```

Do not add a TypeScript loader to the installed CLI as a native-mode workaround.
The current package ships `dist/` and the bootstrap but excludes `src/`. A
successful native probe makes the bootstrap select `src/cli/run.ts`, which is
absent from that installed package. The bundled `register-ts-loader.mjs` command
therefore fails with `ERR_MODULE_NOT_FOUND` before CLI initialization.

This was reproduced with locally built workspace tarballs installed into a
separate consumer under Node 24.19.0: plain Node `--help` succeeded, while the
bundled native-loader invocation and `tsx@4.23.15` invocation both failed on the
missing CLI source. The presence
of type stripping in Node does not imply that its import-resolution probe
succeeds, so ordinary Node execution can still use the working compiled path.
The installed native CLI needs a separate runtime/packaging compatibility fix
before native-loader commands can be recommended.

## Source-checkout development

A repository checkout contains the CLI source. After installing dependencies and
building its workspace packages, the bundled hook can be used to check the
source CLI under Node 24:

```sh
yarn install --immutable
yarn build
node --experimental-strip-types \
  --import ./packages/counterfact/bin/register-ts-loader.mjs \
  ./packages/counterfact/bin/counterfact.js --help
```

The source-checkout `--help` invocation was verified under Node 24.19.0. These
paths are repository paths, not instructions for an installed npm package.

## Runtime differences

|                      | Compiled path                         | Native-capable runtime               |
| -------------------- | ------------------------------------- | ------------------------------------ |
| Authored route files | Compiled before loading               | `.ts` files loaded directly          |
| Route `.cache/`      | Created and managed by the transpiler | Skipped                              |
| Detection            | Native probe fails                    | Type syntax and import probe succeed |
| Hot reload           | Reloads compiled modules              | Reloads authored modules             |

Native route loading and CLI bootstrap selection are separate boundaries. A
runtime's ability to execute authored TypeScript does not establish that the
installed CLI distribution contains its chosen entry point.

## See also

- [Hot reload](./hot-reload.md)
- [Reference](../api.md) — CLI flags
- [Find your workflow](../usage.md)
