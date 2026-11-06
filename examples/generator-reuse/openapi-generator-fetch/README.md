# OpenAPI Generator typescript-fetch: local SDK reuse

This is one application with an existing OpenAPI Generator SDK in `src/generated/sdk/` and a Counterfact simulation in `api/`. There is no contracts package to publish or install. Both generators read the same `openapi.json`.

## Run

Use Node 22.22 or newer, Java 21, and curl. This example needs Counterfact from this PR; released versions do not expose the transformer yet. Build Counterfact at the repository root first (`yarn build`), then run these commands in this directory:

```sh
npm install
npm run verify
npm start
```

The local `file:../../../packages/counterfact` dependency selects this checkout. The PR's automated consumer runner may replace it with the packed build to test publication as well. Generation downloads the actual pinned OpenAPI Generator CLI 7.27.0 JAR from Maven Central, checks its reported version, and runs `typescript-fetch`. No third-party output is handwritten or checked in.

With the server running on its default port:

```sh
curl --fail -X POST http://localhost:3100/pets \
  -H 'Content-Type: application/json' \
  -d '{"id":42,"name":"Rover","owner":{"id":7,"name":"Alex"},"status":"available"}'
```

## How the matching works

`schema-type-transform.mjs` imports the public `openapiGeneratorTransform` export from `counterfact`. For `#/components/schemas/Pet`, that adapter asks TypeScript for the named `Pet` export from `#api-models`; for `Owner`, it asks for `Owner`. It does not scan the SDK, infer names, or look for an npm package.

The `paths` entry in `tsconfig.json` points `#api-models` to this application's `src/generated/sdk/models/index.ts`. OpenAPI Generator emits that model barrel with the arguments in `generate-sdk.mjs`. The alias works from every generated Counterfact directory. These are type-only imports, so the alias has no runtime resolution requirement. Application code can use the same alias or ordinary relative SDK imports.

The exact CLI properties are `modelPropertyNaming=original,stringEnums=false,hideGenerationTimestamp=true,withSeparateModelsAndApi=true,modelPackage=models,apiPackage=apis`. Expected named model exports are `Pet` and `Owner`. `src/app.ts` imports the local SDK model and includes a real generated-client call to the Counterfact endpoint; `api/routes/pets.ts` receives and returns the same `Pet`. `typecheck.ts` asserts model and request-body equality, round trips SDK values, and requires compiler errors for missing owners, bad ids/statuses, incomplete recursive friends, and invalid handler responses.

## Practical limits

A stable local alias is explicit configuration. If an existing SDK uses another folder, model prefix, or suffix, change the alias and/or supply the adapter's `typeName` resolver. Every selected schema must actually have the configured named export. Dictionary and empty schemas may be inlined by this generator, so they cannot blindly use the same naming rule; return `undefined` from `typeName` for such schemas to retain Counterfact's default type.

This example keeps wire property names and uses ordinary JSON objects. It does not establish compatibility for renamed fields, custom templates, class hydration, or date conversion. The adapter reuses the SDK's declared contract; it does not repair differences between a generated SDK and the OpenAPI document. In particular, an earlier real comparison found that OpenAPI Generator 7.27.0's Axios output omitted an inline `allOf` field. That issue is outside this deliberately simple fixture. Fetch implementation code also does not compile with TypeScript's `exactOptionalPropertyTypes` enabled; this application uses ordinary `strict` mode without that additional setting.

The `start` script uses tsx to run local TypeScript helpers and generated SDK
values alongside Counterfact. This avoids Counterfact’s fallback CommonJS
cache rewriting relative imports to `.cjs`. Type-only model aliases require
only the local `tsconfig.json` mapping; the transformer does not load SDK values.
