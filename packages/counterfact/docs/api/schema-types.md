# Schema type transforms

Use a schema type transform to change the TypeScript types Counterfact generates
from your OpenAPI spec. For example, you can reuse an existing domain type,
choose a different binary representation, or modify the properties of a generated
object. Return the default type for schemas you want Counterfact to handle normally.

Configure the callback in [YAML](./cli.md#customize-generated-schema-types) or pass
it to the [programmatic generator](#programmatic-generation).

## Callback signature

These types are exported from both `counterfact` and `@counterfact/generator`:

```ts
import type ts from "typescript";

type JsonSchema = boolean | Readonly<Record<string, unknown>>;

type SchemaTypeTransform = (
  schema: JsonSchema,
  defaultType: ts.TypeNode,
  script: SchemaTypeScript,
  location: SchemaTypeLocation,
) => ts.TypeNode;

interface SchemaTypeLocation {
  readonly schemaPath: string;
}

interface SchemaTypeScript {
  importType(
    moduleSpecifier: string,
    exportedName: string,
  ): ts.TypeReferenceNode;
}
```

| Argument      | What it contains                                                                                                             | What you can do with it                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `schema`      | The schema object being translated, after bundling and overlays, or a boolean schema. Schema properties have type `unknown`. | Inspect standard keywords such as `type`, `format`, and `enum`, or your own `x-*` extensions. Narrow values before using them. |
| `defaultType` | Counterfact's generated TypeScript AST node, including changes already made to child schemas.                                | Return it unchanged, update it with TypeScript factories, or replace it with another type node.                                |
| `script`      | A facade for the generated file receiving this type. It exposes `importType()` only.                                         | Register a named type import and return or compose the resulting reference.                                                    |

`location.schemaPath` identifies the schema in the bundled document, for example
`#/components/schemas/Pet`. It is a JSON Pointer without the source filename.
Three-argument callbacks remain valid implementations.

An **AST node** represents TypeScript syntax. Return a `ts.TypeNode`, not a source
string, a runtime value, or a Promise. TypeScript's `ts.factory` constructs new
nodes; its `is*` helpers identify existing nodes. Treat the schema and input nodes
as read-only and return updated nodes instead of modifying them in place.

For boolean schemas, Counterfact's default is `unknown` for `true` and `never`
for `false`. Guard with `typeof schema === "object"` before inspecting keywords.
The callback is synchronous. Use TypeScript 6.0.3, the compiler version currently
pinned by the generator, when constructing nodes.

## Complete example: generate bigint fields

This example translates an OpenAPI `integer` with `format: int64` into `bigint`.
It also preserves `null` in a nullable field. The resulting types describe the
contract you choose; this example does not convert JSON numbers at runtime.

The API is introduced by [PR #2569](https://github.com/counterfact/api-simulator/pull/2569).
Until a release includes it, run the example from a source checkout containing
the extension. With Node.js 22.11 or newer and Yarn 4 available:

```sh
git clone https://github.com/counterfact/api-simulator.git counterfact-schema-types
cd counterfact-schema-types
git checkout bf46fd686acc52953378ebe20c5a212d4634bc00
yarn install --immutable
yarn build
mkdir schema-type-example
cd schema-type-example
```

Create these six files in `schema-type-example`. The source checkout supplies
`counterfact` and TypeScript through its installed workspace dependencies. In a
project using a release that includes this API, install `counterfact` and
`typescript@6.0.3` in that project instead.

### `package.json`

```json
{
  "private": true,
  "type": "module"
}
```

### `openapi.yaml`

```yaml
openapi: 3.0.3
info:
  title: Invoice types
  version: "1"
paths:
  /invoice:
    get:
      responses:
        "200":
          description: An invoice
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Invoice"
components:
  schemas:
    Invoice:
      type: object
      required: [id, total]
      properties:
        id:
          type: string
        total:
          type: integer
          format: int64
          nullable: true
```

### `counterfact.yaml`

```yaml
spec: ./openapi.yaml
destination: ./api
generate: true
schema-type-transform: ./schema-type-transform.mjs
```

### `schema-type-transform.mjs`

```js
import ts from "typescript";

/**
 * @param {import("typescript").TypeNode} type
 * @returns {import("typescript").TypeNode}
 */
function replaceNumber(type) {
  if (type.kind === ts.SyntaxKind.NumberKeyword) {
    return ts.factory.createKeywordTypeNode(ts.SyntaxKind.BigIntKeyword);
  }
  if (ts.isUnionTypeNode(type)) {
    return ts.factory.createUnionTypeNode(type.types.map(replaceNumber));
  }
  return type;
}

/** @type {import("counterfact").SchemaTypeTransform} */
export default function transform(schema, defaultType) {
  if (
    typeof schema === "object" &&
    schema.type === "integer" &&
    schema.format === "int64"
  ) {
    return replaceNumber(defaultType);
  }
  return defaultType;
}
```

### `consumer.ts`

```ts
import type { Invoice } from "./api/types/components/schemas/Invoice.js";

export const invoice: Invoice = { id: "invoice-1", total: 12n };
export const unknownTotal: Invoice = { id: "invoice-2", total: null };

// @ts-expect-error The transform replaces number with bigint.
export const wrongTotal: Invoice = { id: "invoice-3", total: 12 };
// @ts-expect-error A required nullable property must still be present.
export const missingTotal: Invoice = { id: "invoice-4" };
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": []
  },
  "include": ["consumer.ts", "schema-type-transform.mjs"]
}
```

Generate and check the result from `schema-type-example`:

```sh
node ../packages/counterfact/bin/counterfact.js --config counterfact.yaml --no-update-check
node ../node_modules/typescript/bin/tsc --project tsconfig.json
```

The generated `api/types/components/schemas/Invoice.ts` contains:

```ts
export type Invoice = {
  id: string;
  total: bigint | null;
};
```

The TypeScript check should finish without errors: the two `@ts-expect-error`
lines establish that invalid assignments are rejected. If you remove the transform
setting and regenerate, the check fails because `bigint` is no longer accepted
and the expected error for `total: 12` disappears. Restore the setting and regenerate
to return to the customized contract.

For a released, locally installed CLI, use `counterfact --config counterfact.yaml`
and your project's TypeScript command in place of the two source-checkout paths.

## Import an existing type

`script.importType(moduleSpecifier, exportedName)` registers a **named, type-only
import** and returns a `TypeReferenceNode` using the local alias Counterfact chose.
Return that node directly or use it inside a larger type.

For example, this callback uses Node's `Buffer` type for schemas explicitly marked
with `x-node-buffer: true`. The generated project needs Node type declarations,
such as `@types/node`, to resolve `node:buffer`:

```js
/** @type {import("counterfact").SchemaTypeTransform} */
export default function transform(schema, defaultType, script) {
  if (typeof schema === "object" && schema["x-node-buffer"] === true) {
    return script.importType("node:buffer", "Buffer");
  }
  return defaultType;
}
```

- Importing the same export from the same module repeatedly reuses one import.
- Equal export names from different modules receive distinct aliases. Imports
  also avoid collisions with generated declarations and standard names such as
  `Array`. Use the returned node; do not guess its identifier.
- Package specifiers resolve from the generated project. A relative specifier
  resolves from **each generated file**, not from the callback or config file.
  Package specifiers are easier to reuse across inline and named schemas because
  their generated files can live at different directory depths.
- This method imports an existing exported type. It does not create the target
  package or declaration. The export name must be an unqualified ASCII identifier such as `UUID`;
  qualified expressions such as `Domain.UUID` are not accepted as an export name.
- Imports that the resulting type no longer references are omitted. Referenced
  files may still be generated because the default generation happened first.

## Programmatic generation

Use `schemaTypeTransform` in the generator's options:

```js
import { CodeGenerator } from "@counterfact/generator";
import schemaTypeTransform from "./schema-type-transform.mjs";

await new CodeGenerator("./openapi.yaml", "./api", {
  routes: true,
  types: true,
  schemaTypeTransform,
}).generate();
```

`counterfact({ basePath, schemaTypeTransform, ... })` accepts the same callback
when embedding the full simulator. See [simulator lifecycle](./simulator.md) for
its generation and startup options.

When passing a shared `Repository` to multiple generators, configure the callback
on `new Repository({ schemaTypeTransform })`. If you also set a generator's
callback option, supply the same function on both. Different callbacks are
rejected so cached declarations cannot silently mix transformation policies.
The CLI handles shared repositories for versioned API groups automatically.

## When the callback runs

1. Counterfact generates a schema's default type. Child schemas pass through the
   callback before the containing schema's type is assembled.
2. Counterfact calls your transform with the schema, generated type, and facade.
3. The returned node is incorporated into the containing type or exported definition.

Named definitions reached through `$ref` are transformed when their definitions
are generated. Ordinary reference sites keep pointing to those definitions and
do not invoke the callback again. Recursive schemas retain their reference graph.
A containing schema can still add constraints, such as required properties or
discriminator tags, around the result. Replacing a containing type can discard
transformed child types.

The callback is scoped to a generator/repository instance and is reused during
specification watching. Restart the CLI after changing the callback module.
Keep results deterministic; callback counts and ordering across files are not
part of the contract. The callback does not expose a schema pointer or definition
name. Identically shaped definitions can therefore be indistinguishable even if
a different generator treats them differently based on their references. Use
explicit schema metadata or `x-*` extensions when your transform needs to
distinguish otherwise identical shapes.

## Errors and boundaries

| Symptom                                                           | What to check                                                                                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema-type-transform must be a nonempty JavaScript module path` | Use a nonempty path string in YAML. The programmatic API takes a function instead.                                                            |
| `Could not load schema type transform ...`                        | Resolve the path relative to the YAML file. Check the module's imports and use `.mjs` for ES modules or `.cjs` for CommonJS.                  |
| `must default-export a function`                                  | Export the callback itself, rather than an object containing it.                                                                              |
| `Expected a synchronous TypeNode result`                          | Return a TypeScript type node on every branch. Do not return a Promise, string, statement, or `undefined`.                                    |
| `Schema type transform failed at ...`                             | The diagnostic identifies the schema location. Inspect the callback error following it; customization failures do not fall back to `unknown`. |
| TypeScript cannot resolve an imported type                        | Install or supply the named module in the generated project, and check relative imports from the generated file.                              |

The hook customizes schema types. It does not control handler names, file layout,
interface declarations, runtime enums, or serialization. Default generation must
succeed before the callback can run. Schema type changes do not change validation
or convert request/response values. Existing route edits retain the usual
[regeneration guarantees](../features/generated-code.md).

Startup generate overrides retain the configured transform callback. The simulator status snapshot reports effective generation flags and the listener address; executable callbacks are excluded from that cloneable snapshot.

## Compatibility presets

Use `schemaTypeCompatibility()` to change Counterfact's own generated model
shapes toward the conventions of another OpenAPI-to-TypeScript generator.
Counterfact still generates independent models. You do not need an SDK package,
and no types from another generator are imported.

The factory and its option/target types are exported from `counterfact` and
`@counterfact/generator`. Create `schema-type-transform.mjs`:

```js
import { schemaTypeCompatibility } from "counterfact";

export default schemaTypeCompatibility("orval");
```

Select it through the existing configuration setting:

```yaml
spec: ./openapi.yaml
destination: ./api
generate: true
schema-type-transform: ./schema-type-transform.mjs
```

For example, given this schema:

```yaml
type: object
required: [id, attachment]
properties:
  id:
    type: integer
    readOnly: true
  attachment:
    type: string
    format: binary
  uploadedAt:
    type: string
    format: date-time
```

Counterfact normally generates `attachment: Uint8Array | string`. With the
Orval preset it generates this independent model:

```ts
export type Model = {
  readonly id: number;
  attachment: globalThis.Blob;
  uploadedAt?: string;
};
```

The Fetch preset for OpenAPI Generator instead gives `uploadedAt?:
globalThis.Date`. `globalThis` prevents a generated model called `Date`, `Blob`,
`File`, or `ArrayBuffer` from shadowing the built-in type. Standard DOM library
types must be available when selecting browser binary types.

### Preset conventions

The table describes targeted model conventions, not a guarantee of complete
compatibility with every release or configuration. The source links below
identify the mapping logic inspected for these presets.

| Target                       | date / date-time | string binary | string byte | readOnly properties |
| ---------------------------- | ---------------- | ------------- | ----------- | ------------------- |
| `openapi-typescript`         | string           | string        | string      | readonly            |
| `hey-api`                    | string           | Blob or File  | string      | readonly            |
| `orval`                      | string           | Blob          | string      | readonly            |
| `openapi-generator-fetch`    | Date             | Blob          | string      | readonly            |
| `openapi-generator-axios`    | string           | File          | string      | mutable             |
| `swagger-typescript-api`     | string           | File          | Blob        | mutable             |
| `openapi-typescript-codegen` | string           | Blob          | string      | readonly            |
| `nswag`                      | Date             | string        | string      | readonly            |

Legacy Swagger `type: file` follows the binary mapping except NSwag uses `any`. NSwag's string-binary mapping targets its DTO string
resolver, not endpoint-specific `FileParameter`/file-response wrappers.

The openapi-typescript preset also emits an empty explicit object as
`{ [key: string]: never }`, and makes properties with defaults required outside
inline request bodies/parameters. This matches the model conventions with
`emptyObjectsUnknown: false` and `defaultNonNullable: true`. Shared referenced
models keep their definition's optionality even when referenced by a request.
Other presets preserve Counterfact's empty-object and default-property behavior.

Source references:

- [openapi-typescript schema transformation](https://github.com/openapi-ts/openapi-typescript/blob/main/packages/openapi-typescript/src/transform/schema-object.ts)
- [Hey API scalar mapping](https://github.com/hey-api/hey-api/blob/main/packages/openapi-ts/src/plugins/@hey-api/typescript/v1/toAst/string.ts) and [object properties](https://github.com/hey-api/hey-api/blob/main/packages/openapi-ts/src/plugins/@hey-api/typescript/v1/toAst/object.ts)
- [Orval scalar mapping](https://github.com/orval-labs/orval/blob/master/packages/core/src/getters/scalar.ts) and [object properties](https://github.com/orval-labs/orval/blob/master/packages/core/src/getters/object.ts)
- [OpenAPI Generator shared TypeScript mappings](https://github.com/OpenAPITools/openapi-generator/blob/master/modules/openapi-generator/src/main/java/org/openapitools/codegen/languages/AbstractTypeScriptClientCodegen.java) and [Fetch overrides](https://github.com/OpenAPITools/openapi-generator/blob/master/modules/openapi-generator/src/main/java/org/openapitools/codegen/languages/TypeScriptFetchClientCodegen.java)
- [swagger-typescript-api primitive mappings](https://github.com/acacode/swagger-typescript-api/blob/main/src/configuration.ts) and [property modifiers](https://github.com/acacode/swagger-typescript-api/blob/main/src/schema-parser/base-schema-parsers/object.ts)
- [openapi-typescript-codegen scalar mappings](https://github.com/ferdikoomen/openapi-typescript-codegen/blob/master/src/openApi/v3/parser/getMappedType.ts) and [binary output](https://github.com/ferdikoomen/openapi-typescript-codegen/blob/master/src/templates/partials/base.hbs)
- [NSwag/NJsonSchema TypeScript resolver](https://github.com/RicoSuter/NJsonSchema/blob/master/src/NJsonSchema.CodeGeneration.TypeScript/TypeScriptTypeResolver.cs)

### Match custom generator settings

Pass overrides when the other generator uses different options:

```js
import { schemaTypeCompatibility } from "counterfact";

export default schemaTypeCompatibility("orval", {
  dateType: "Date", // Orval useDates: true
  readonlyProperties: "none", // Orval suppressReadonlyModifier: true
});
```

```ts
interface SchemaTypeCompatibilityOptions {
  readonly dateType?: "string" | "Date";
  readonly binaryType?:
    "string" | "Blob" | "File" | "Blob | File" | "ArrayBuffer" | "any";
  readonly byteType?: "string" | "Blob";
  readonly readonlyProperties?: "schema" | "all" | "none";
  readonly emptyObjectType?: "preserve" | "unknown-record" | "never-record";
  readonly defaultPropertiesRequired?: boolean;
}
```

`readonlyProperties: "schema"` marks named properties with a direct
`readOnly: true` schema; `all` marks all named properties; `none` keeps them
mutable. This setting does not make arrays immutable or remove read/write-only
fields. Setting `binaryType` also overrides the legacy `type: file` mapping.
`emptyObjectType` changes only empty explicit object schemas, not unspecified
schemas, populated objects, or dictionaries.

For programmatic generation:

```js
import { CodeGenerator, schemaTypeCompatibility } from "@counterfact/generator";

await new CodeGenerator("./openapi.yaml", "./api", {
  routes: true,
  types: true,
  schemaTypeTransform: schemaTypeCompatibility("hey-api"),
}).generate();
```

### Compatibility boundaries

These presets change static types. They do not hydrate `Date`, construct `Blob`
or `File`, or alter request validation, parsing, response serialization, or
random example generation. For wire-oriented dates, use `dateType: "string"`
and configure the other generator accordingly. This distinction matters most
for handler request inputs: a Date annotation does not convert incoming JSON.

Parsed multipart uploads deliberately retain Counterfact's `MultipartFile`
contract, including its buffer and file metadata. They are not browser `File`
instances. This remains a compatibility boundary even with a binary preset;
regular JSON model generation and parsed multipart model generation are distinct.

Literal enums/const, boolean schemas, nullability, arrays, recursive references,
and schema composition retain Counterfact's generation. Enum and const
constraints are not broadened into Date or binary object types. The presets
match structural enum unions, not separate nominal TypeScript enums. Configure
union enums in the other tool, such as codegen's `useUnionTypes`, or NSwag's
`EnumStyle: StringLiteral` with interface DTOs and `NullValue: Null`. DTO classes
with methods or constructors require a separate conversion layer.

Keep property names unchanged in the other tool (for example, OpenAPI Generator
`modelPropertyNaming: original`). These callbacks do not rename wire fields,
reproduce SDK layout, synthesize operation wrappers, emulate every dictionary,
discriminator, read/write model split, or support custom templates, Temporal,
Moment, or branded types. The live compatibility suite installs pinned third-party generators, runs them
and Counterfact on the same OpenAPI fixture, then compiles assignments in both
directions between their actual outputs. It also compares property names,
optionality, and read-only flags, and rejects an untransformed Counterfact output
as a negative control. It does not establish compatibility for every schema.

Run `yarn test:generator-compatibility` after building the generator, or append
a target such as `orval` to run one tool. This separate suite requires registry
access and, for OpenAPI Generator/NSwag, Java/.NET respectively. The version pins
and generator settings live in `packages/generator/test/compatibility/`. The
Generator compatibility workflow runs all eight targets, including both OpenAPI
Generator backends, and retains actual generated sources and JSON comparison
reports as job artifacts. Ordinary focused tests remain offline AST regressions.
