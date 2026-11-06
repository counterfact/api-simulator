# Reuse a locally generated SDK with Counterfact

These eight projects demonstrate seven generator families in an ordinary single
application. The SDK is generated into a normal local directory. None publishes
or installs the generated models as an SDK package.

| Project                                                     | Pinned generator | Local generated models              | Local TypeScript alias |
| ----------------------------------------------------------- | ---------------- | ----------------------------------- | ---------------------- |
| [openapi-typescript](./openapi-typescript/)                 | 7.13.0           | `src/generated/schema.ts`           | `@app/api-models`      |
| [Hey API](./hey-api/)                                       | 0.99.0           | `src/generated/types.gen.ts`        | `#api-models`          |
| [Orval](./orval/)                                           | 8.46.0           | `generated/models/index.ts`         | `#orval-models`        |
| [OpenAPI Generator Fetch](./openapi-generator-fetch/)       | 7.27.0           | `src/generated/sdk/models/index.ts` | `#api-models`          |
| [OpenAPI Generator Axios](./openapi-generator-axios/)       | 7.27.0           | `src/generated/sdk/models/index.ts` | `#api-models`          |
| [swagger-typescript-api](./swagger-typescript-api/)         | 13.13.0          | `src/generated/sdk/models.ts`       | `#sdk-models`          |
| [openapi-typescript-codegen](./openapi-typescript-codegen/) | 0.29.0           | `src/generated/sdk/index.ts`        | `#sdk-models`          |
| [NSwag](./nswag/)                                           | 14.6.3           | `src/generated/client.ts`           | `#api-models`          |

Each folder owns its input specification, real generator configuration,
Counterfact configuration/transform, authored handler, and compiler checks.
Read that project's README for the individual commands and runtime limitations.
The namespace-like aliases above are `tsconfig.json` path mappings to local
files, not npm packages. They keep the type-only imports stable across
Counterfact's generated directories. Runtime SDK values use normal local
imports. Each project builds its app helpers and SDK TypeScript to JavaScript
with `build:runtime` before serving; TypeScript aliases alone do not implement
runtime module resolution. Type-only reuse itself needs no runtime alias.

## Run and verify

This API is not yet released. From a checkout containing PR #2638, install the
repository dependencies and run `yarn build`, then:

```sh
yarn test:generator-reuse openapi-typescript
```

Replace the target with any directory name in the table, or omit it to run all
examples. The runner creates a fresh copy of each app, installs the built local
Counterfact packages and the app's pinned third-party generator, executes
`npm run verify`, starts the real Counterfact HTTP server, and checks its response.
It saves the resulting sources and a report under `artifacts/generator-reuse/`.
No third-party generated models are checked in or fabricated.

The local Counterfact tarballs are solely a way to test this unreleased feature
in an isolated installation. They do not package the generated SDK. After the
feature is published, an ordinary application installs the containing Counterfact
release and keeps its existing generator and local generated-files workflow.
You can also open one folder in this checkout and follow its individual commands.

The CI matrix runs these same checks on Linux with Node 24, Java 21 for OpenAPI
Generator, and .NET 8 for NSwag. Compiler errors, missing exports, and HTTP failures
fail the proof rather than silently falling back to handwritten models.

## What these examples establish

Counterfact derives the model's name from its OpenAPI schema key. An adapter
selects that named export, or `components["schemas"][name]` for openapi-typescript,
from the local file selected by the alias. Exact-type checks and negative
controls exercise the actual generated types. Examples with nominal enums
reuse the SDK's enum identity. NSwag explicitly constructs its DTO class; the
transformer does not hydrate incoming JSON into classes.

Project settings still matter: generate models first, keep the same OpenAPI
input for both tools, map any renamed exports, and resolve extensionless SDK
imports with the documented module-resolution settings. Schemas the other tool
inlines without exporting a model need an explicit alias or fallback.
