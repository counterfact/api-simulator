# Local openapi-typescript-codegen SDK with Counterfact

This is one application with its generated Fetch SDK in `src/generated/sdk`.
There is no contracts package to publish, install, or maintain.
The existing SDK client and a Counterfact route use the very same `Pet` and nominal `PetStatus` enum.

## Run

Requires Node 22.22 or newer and a built Counterfact checkout containing the unreleased model reuse transforms from PR #2638.
The local `file:` dependency points at that checkout's Counterfact package.
Its internal workspace dependencies must also be available; for an isolated copy, install packed versions of all Counterfact workspace packages before running this example.
Do not replace it with the latest public release until that release exports `openapiTypescriptCodegenTransform`.

```sh
npm install
npm run verify
npm start
```

In a second terminal:

```sh
curl http://localhost:3100/pet
```

The authored route returns `{"id":1,"name":"Milo","status":"available"}`.
`src/client.ts` shows the normal SDK call to that same URL.
Importing that module does not send a request; calling `loadPet()` does.

## What resolves to what

`npm run generate:models` runs `node scripts/generate-models.mjs` against the real pinned `openapi-typescript-codegen@0.29.0` API.
It writes the complete SDK to `src/generated/sdk`, including the public barrel `index.ts`, `models/Pet.ts`, `models/PetStatus.ts`, and `services/PetsService.ts`.
The SDK exports named `Pet`, `PetStatus`, and `PetsService`.
The enum is deliberately generated with `useUnionTypes: false`.

`npm run generate:counterfact` runs the public CLI using `counterfact.yaml`.
The callback in `schema-type-transform.mjs` tells Counterfact to import a model's OpenAPI schema name from `#sdk-models`.
The application compiler resolves that alias to the local SDK barrel through `tsconfig.json`.
For example, the schema key `Pet` selects the barrel's exported `Pet`; `PetStatus` selects its exported `PetStatus`.
Counterfact does not search directories or inspect the SDK to discover this mapping.

`api/routes/pet.ts` is authored code and is preserved during regeneration.
Its `PetStatus.AVAILABLE` value uses a normal relative runtime import from the SDK.
Counterfact's generated alias imports are type-only, so `#sdk-models` needs compiler resolution but no runtime loader mapping.
This also avoids relative imports that would need different depths in different generated type files.

## Checks and limits

`npm run typecheck` uses pinned TypeScript 5.9.3 to compile the real generated SDK, generated Counterfact contracts, application client and authored route together.
It verifies exact model and nominal enum identity, both assignment directions, a valid route response, and rejected missing fields, wrong IDs, raw string enums and invalid route responses.
`@ts-expect-error` controls make compilation fail if those invalid examples become accepted.
The full upstream Fetch SDK is compiled with its ordinary optional-property setting; this example does not enable `exactOptionalPropertyTypes`.
`skipLibCheck` skips dependency declarations, not these generated SDK source files.

Generation must run in order: SDK first, Counterfact second, compilation last.
If you use SDK naming options or custom templates that rename `Pet`, configure the transform's `typeName` mapping explicitly.
Inline schemas still use Counterfact's normal generation.
Sharing the SDK enum establishes type identity; it does not turn HTTP JSON strings into enum runtime objects or add runtime validation.

Generated output is intentionally not hand-written or checked in.
Execution requires the real third-party generator; this example does not substitute a mock generator or claim an unperformed live run.

The `start` script uses tsx to run local TypeScript helpers and generated SDK
values alongside Counterfact. This avoids Counterfact’s fallback CommonJS
cache rewriting relative imports to `.cjs`. Type-only model aliases require
only the local `tsconfig.json` mapping; the transformer does not load SDK values.
