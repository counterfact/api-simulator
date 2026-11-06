# openapi-typescript and Counterfact in one application

This example keeps normal generated files inside the application. Nothing is published as an SDK package. It requires the Counterfact build from this pull request because released versions do not yet export the adapter.

From the repository root, build Counterfact first with `yarn build`. Then run:

```sh
cd examples/generator-reuse/openapi-typescript
npm install
npm run verify
```

`generate:models` runs the real, pinned `openapi-typescript@7.13.0` CLI against `openapi.yaml`. Its output is `src/generated/schema.ts`; the exported `components` interface contains `components["schemas"]["Pet"]`. No generated output is checked in or hand written.

`generate:counterfact` runs the public Counterfact CLI with `counterfact.yaml`. The adapter replaces Counterfact's Pet definition with a type-only import of `components` from `@app/api-models` and an alias to `components["schemas"]["Pet"]`. The schema key `Pet` supplies the lookup key. Counterfact does not search your source tree or discover an SDK automatically.

The application chooses the file location through the `@app/api-models` path in `tsconfig.json`. This is a project-local TypeScript alias, not an npm package. It gives imports in Counterfact's nested output a stable name. These generated imports are type-only, so there is no corresponding runtime alias to resolve. Your frontend typecheck must use the same mapping.

This example pins TypeScript 5.9.3 to satisfy openapi-typescript 7.13.0's TypeScript 5 peer dependency. Its `module: "ESNext"` and `moduleResolution: "Bundler"` options match a frontend application's compiler setup. Use a TypeScript version supported by your generator and module options supported by that compiler. Counterfact can keep its own nested TypeScript dependency.

The authored `api/routes/pets/{petId}.ts` and `api/routes/index.ts` handlers return the shared model from `src/pet.ts` through Counterfact's typed response builder. This checks both nested and root route types. Counterfact preserves those authored handlers when regenerating. Inline schemas still use Counterfact's own generation.

To serve after generating, run `npm start`. `GET /pets/42` returns `{"id":"42","name":"Milo","status":"available"}`; `GET /` uses the id `default`.

`typecheck.ts` compares the actual upstream and Counterfact model types, checks assignments in both directions, and includes negative controls for invalid enums, missing required fields, and recursive models. `verify.mjs` separately checks the generated upstream export and Counterfact's imported indexed alias, so accidentally generating a structurally similar local interface does not pass as reuse.

The checked-in dependency points at this repository's local Counterfact package. The repository CI installs packed builds of the pull request's workspace packages so the example exercises the changed generator rather than a released registry copy. For a standalone application after release, install the version containing this adapter instead.

## Verification status

Local Counterfact generation was run successfully and its Pet alias imports `components` from `@app/api-models`. Local registry DNS is blocked in the editing environment, so actual openapi-typescript generation and complete verification have not been run locally. CI must install the pinned upstream generator and run `npm run verify`. Third-party generated files are intentionally absent until that command runs.

## Limits

This adapter expects the OpenAPI 3 `components["schemas"]` shape. Use the same input specification for both generators. Custom transformations that rename schema keys need an explicit `typeName` mapping. Reuse checks TypeScript contracts; it does not convert JSON values, validate network responses, or supply runtime DTO constructors.

The `start` script uses tsx to run local TypeScript helpers and generated SDK
values alongside Counterfact. This avoids Counterfact’s fallback CommonJS
cache rewriting relative imports to `.cjs`. Type-only model aliases require
only the local `tsconfig.json` mapping; the transformer does not load SDK values.
