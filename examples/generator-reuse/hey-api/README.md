# Hey API models in an ordinary app

This app generates Hey API models into `src/generated/types.gen.ts` and Counterfact routes into `api/`.
No SDK package, publish step, workspace package, or barrel is needed.
Both tools read `openapi.json`.

From the repository root, build Counterfact once with `yarn build`.
Then run:

```sh
cd examples/generator-reuse/hey-api
npm install
npm run verify
```

`counterfact` is a local file dependency on this PR's built package because the adapter is not yet released.
For CI that installs a packed Counterfact build, replace that dependency with the packed build before `npm install`.
Node 22.22 or newer is required.
The exact upstream generator is `@hey-api/openapi-ts@0.99.0`, with `typescript@5.9.3` explicitly installed for its compiler peer.

`generate-models.mjs` invokes the real Hey API generator with only `@hey-api/typescript` enabled.
Its `Pet` export lives in `src/generated/types.gen.ts`.
`schema-type-transform.mjs` imports the public `heyApiTransform` export from Counterfact.
For the OpenAPI key `#/components/schemas/Pet`, that adapter emits a type import of the named export `Pet` from `#api-models`.
The `paths` entry in `tsconfig.json` resolves that alias to the local generated file from every Counterfact output depth.
The alias is a compiler setting, not a package.
These imports are type-only and disappear at runtime.

The application data in `src/pet.ts` uses Hey API's model directly.
The authored Counterfact handlers return that same value through Counterfact's generated response API.
There are handlers at two output depths to exercise alias resolution.
The compiler also checks expected failures for a missing required name and an invalid enum member, both against the upstream model and against Counterfact's response contract.
An unused `@ts-expect-error` fails `typecheck`, so a response contract that becomes `any` cannot quietly pass.
No generated SDK files or generated Counterfact types are checked in.

The adapter matches exact schema keys to named exports; it does not search files or compare shapes.
If Hey API naming options change an export, supply `typeName` explicitly in the transform.
Inline operation schemas still use Counterfact's generated types.
This proof uses JSON wire data; transforming dates into runtime objects needs a separate serialization decision.
The `paths` mapping must also be present in an editor or build configuration that checks these handlers.

Counterfact generation was run locally and its Pet alias was confirmed to import the real model location through `#api-models`.
The JavaScript entry points also passed syntax checks.
Local registry DNS was unavailable, so the real upstream generator and full verification were not run locally.
Run `npm run verify` in a network-enabled checkout to generate actual outputs and compile the consumers.

The verification command also runs `build:runtime`. This ordinary TypeScript
build emits app helpers and generated SDK values as adjacent JavaScript files
for Counterfact's Node server to import. The model aliases are type-only and
need no runtime alias. SDK enum values and DTO constructors are real runtime
imports and need this build; they are not supplied by the adapter.
