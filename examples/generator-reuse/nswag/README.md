# NSwag and Counterfact in one application

This app keeps NSwag's generated Fetch client and DTO classes in
`src/generated/client.ts`. There is no SDK package, publishing step, copied
model definition, or model registry. Both generators read `openapi.json`.

## Run

Prerequisites: Node 22.22 or later, npm, and the .NET 8 SDK/runtime. The pinned
NSwag.ConsoleCore tool is 14.6.3 and TypeScript is 5.9.3. The script installs
NSwag locally under `.tools`, so the first run needs NuGet access. No global
NSwag install is required.

From this directory, after the repository's unreleased Counterfact packages
have been built and installed into this example:

```sh
npm install
npm run verify
```

The `file:../../../packages/counterfact` dependency uses this checkout's
Counterfact package. This feature is not yet released; when running outside
the workspace, install the matching packed versions of all Counterfact
workspace packages, as the integration runner does. Installing the current
published Counterfact release alone does not provide this adapter.

`verify` runs the real upstream generator, generates Counterfact's types, and
then compiles the complete application. Its `@ts-expect-error` checks must
actually fail compilation at the marked expressions, or TypeScript rejects
the verification itself.

To serve the authored handlers after generation:

```sh
npx counterfact --config counterfact.yaml --serve --no-update-check
curl http://localhost:3100/pets
curl http://localhost:3100/pets/1
```

Both endpoints return HTTP 200 with
`{"id":1,"name":"Buddy","status":"available"}`. The generation config
disables serving, watching, and the REPL; `--serve` enables the HTTP server
for this separate step.

## How models are found

`generate-models.mjs` runs this pinned local .NET tool:

```sh
dotnet tool install NSwag.ConsoleCore --version 14.6.3 --tool-path .tools
.tools/nswag openapi2tsclient /input:openapi.json /output:src/generated/client.ts /Template:Fetch /GenerateClientClasses:true /GenerateDtoTypes:true /TypeStyle:Class /EnumStyle:Enum /TypeScriptVersion:5.0
```

The tool exports the `Pet` DTO class and `PetStatus` enum. The transform is
given `moduleSpecifier: "#api-models"`; `tsconfig.json` maps that alias to
the generated file inside this app. Counterfact uses the schema keys
`Pet` and `PetStatus` as the exported names. For example, its generated
`api/types/components/schemas/Pet.ts` imports `Pet` from `#api-models` and
exports a type alias to that exact class type. The alias works for both
shallow and deeper generated route files.

Nothing searches the filesystem or infers the output location. You configure
the local module location once. Renamed exports require `typeName`; namespace
output or custom templates require a matching barrel or custom transform.

## DTO classes require runtime construction

`src/pet.ts` imports the actual generated class by a relative path and calls
`Pet.fromJS`. That creates an instance with NSwag's `init` and `toJSON`
methods. Counterfact then accepts the same instance as its response model.
The generated client's own response parsing likewise uses NSwag's factory.

The adapter supplies type-only imports. It does not hydrate request bodies
or turn JSON objects into class instances. A handler receiving JSON must
explicitly call the relevant NSwag factory before using DTO methods. This
example's GET handler returns a class instance that application code already
constructed. NSwag's `toJSON` produces the HTTP response's plain wire data.

`src/verify-types.ts` checks assignment in both directions between the NSwag
and Counterfact model. It also checks that an ordinary JSON object without
the DTO methods is rejected and that a raw string cannot replace the nominal
`PetStatus` enum. The route includes a negative response-type check too.
`Pet.fromJS` accepts untyped JSON; it is hydration, not input validation.

## Verification evidence

Counterfact generation ran successfully against this spec and emitted direct
aliases to `Pet` and `PetStatus`. The local machine has only .NET 10, so
NSwag's .NET 8 tool, the final compiler checks, and the HTTP requests have
not been run locally. The integration runner must run `npm run verify` with
the actual third-party generator and smoke-test both endpoints before this
example is described as passing end to end. No upstream output is checked in
or hand-written as a substitute for generation.

The verification command also runs `build:runtime`. This ordinary TypeScript
build emits app helpers and generated SDK values as adjacent JavaScript files
for Counterfact's Node server to import. The model aliases are type-only and
need no runtime alias. SDK enum values and DTO constructors are real runtime
imports and need this build; they are not supplied by the adapter.
