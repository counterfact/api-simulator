# Orval in the same app as Counterfact

This example uses Orval 8.46.0 to generate a fetch client and individual model
files inside the app. Counterfact reuses those local model exports. There is
no SDK package to publish and no second project.

From this directory, with the PR's Counterfact packages built and installed:

```sh
npm install
npm run check
npm start
```

The `file:` dependencies select this checkout because the adapter is unreleased.
For a standalone copy, install a Counterfact release containing `orvalTransform`
and its matching `@counterfact/generator` instead. Node 22.22 or newer is required.

`npm run generate:models` runs `orval --config orval.config.mjs`. Orval reads
`openapi.yaml`, writes its fetch client to `generated/client.ts`, and writes
models to `generated/models/`. Its `index.ts` barrel exports `Pet` and `Owner`.
Those files are actual generator output and are deliberately not checked in.

`npm run generate:counterfact` runs `counterfact --config counterfact.yaml
--generate` with the transform from
`schema-type-transform.mjs`. The public `orvalTransform` export maps a direct
schema definition named `Pet` to the named export `Pet` from `#orval-models`.
The TypeScript alias resolves that module to the local Orval barrel. The same
rule maps `Owner` to `Owner`. It does not search the filesystem or inspect Orval.
If Orval changes or removes an export, TypeScript reports the broken import.

The authored `api/routes/pets.ts` passes Counterfact's request body to
`src/pets.ts`, which accepts Orval's `Pet`, and returns that result as the 201
response. `src/typecheck.ts` checks model equality, both assignment directions,
missing properties, wrong property types, nested models, and an invalid handler
response. An unused `@ts-expect-error` fails compilation, so unexpectedly loose
types cannot silently pass these negative controls.

The alias is for types only. Counterfact emits type-only model imports, so no
runtime alias loader is needed for them. The fetch client and application code
use ordinary relative imports at runtime. Orval's client is generated and
compiled; no live backend is contacted by the check.

Generate Orval first, then Counterfact. Regenerate both after changing the spec.
Counterfact preserves the authored handler. If an existing Orval setup has a
different model naming convention or no barrel, configure `typeName` or the
`moduleSpecifier(schemaName)` resolver explicitly. Inline operation schemas stay
Counterfact-generated. Reusing a type does not add runtime serialization or
validation, and custom dates/classes or renamed wire fields still need separate
runtime handling.

Actual Orval generation requires installing the pinned tool. This example must
be validated with `npm run check` in an environment with registry access; no
handwritten stand-in models are used.
