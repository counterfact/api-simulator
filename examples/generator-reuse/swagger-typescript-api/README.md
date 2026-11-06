# swagger-typescript-api in an ordinary application

The generated SDK stays in this application's `src/generated/sdk` folder.
No model package is published or installed separately.
This example needs Counterfact's unreleased PR #2638 API; its `file:` dependency points at this checkout's Counterfact package.
When testing packed builds, replace that dependency with the branch's packed Counterfact packages before installing.

Run `npm install`, then `npm run verify`.
The command runs swagger-typescript-api 13.13.0, generates Counterfact types through the YAML configuration, and compiles both actual outputs plus the authored handler.
TypeScript is pinned to 5.9.3 alongside the third-party generator.
Run `npm start`, then request `http://localhost:3100/pets`.
The response is `[{"id":1,"name":"Ada","status":"available"}]`.

`scripts/generate-models.mjs` generates a normal modular fetch client and its models, including a nominal `PetStatus` enum, from `openapi.yaml`.
`src/pets.ts` constructs SDK models with the real generated enum.
The authored Counterfact handler returns those same objects.

The adapter uses the schema key to choose the exported name: `Pet` maps to `Pet`, and `PetStatus` maps to `PetStatus` in `models.ts`.
The application supplies that module location through `#sdk-models`, a local TypeScript `paths` alias.
Counterfact emits type-only imports, so this alias needs no runtime loader.
The runtime enum import in `src/pets.ts` uses the ordinary relative SDK path.
The alias also avoids computing different relative imports for every Counterfact output directory.

`type-tests/reuse.ts` checks model, recursive model, and enum identity against the actual generated exports, assignment in both directions, and an authored handler returning SDK objects.
Its negative compiler controls reject a raw string in place of the nominal enum, incorrect field types, omitted required fields, and an invalid response.
An unused `@ts-expect-error` fails compilation, so weakening these types cannot silently pass.

This configuration assumes matching export names and this tool's standard data-contract module.
Custom names require an explicit `typeName` mapping; the adapter does not scan SDK files or guess naming settings.
Only named schema definitions are redirected; inline operation shapes retain Counterfact generation.
Reuse shares declarations, not runtime serialization, validation, or class construction.
The SDK uses its normal optional-property settings; the example does not enable `exactOptionalPropertyTypes` for the generated fetch implementation.
Generated output is intentionally not checked in: verification must run the real tool.

The `start` script uses tsx to run local TypeScript helpers and generated SDK
values alongside Counterfact. This avoids Counterfact’s fallback CommonJS
cache rewriting relative imports to `.cjs`. Type-only model aliases require
only the local `tsconfig.json` mapping; the transformer does not load SDK values.
