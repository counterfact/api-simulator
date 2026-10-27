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
) => ts.TypeNode;

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
