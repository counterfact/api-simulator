# NSwag and Counterfact in one application

This app keeps NSwag's generated Fetch client and DTO classes in
`src/generated/client.ts`. There is no SDK package, publishing step, copied
model definition, or model registry. Both generators read `openapi.json`.

## Run

Prerequisites: Node 22.22 or later, npm, and the .NET 10 SDK/runtime. The pinned
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
npm start
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
`PetStatus` enum. An unused handler in the compiler-only file checks that
responses reject a plain object too. The live handlers only return valid DTOs.
`Pet.fromJS` accepts untyped JSON; it is hydration, not input validation.

The `start` script uses tsx to run local TypeScript helpers and generated SDK
values alongside Counterfact. This avoids Counterfact’s fallback CommonJS
cache rewriting relative imports to `.cjs`. Type-only model aliases require
only the local `tsconfig.json` mapping; the transformer does not load SDK values.
