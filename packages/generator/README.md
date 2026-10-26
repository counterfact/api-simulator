# `@counterfact/generator`

Generate Counterfact route scaffolds, OpenAPI-derived TypeScript contracts,
scenario types, and compatible local `counterfact-types` templates.

The public package boundary is intentionally small:
`CodeGenerator`, `ScenarioFileGenerator`, and `Repository` support the
`counterfact` facade, `generateVersionsTsContent` supports multi-version
projects, and `buildOperationTypeNameMapping` supports legacy route migration.
Concrete coders remain private implementation details.

The build carries the generated-handler-compatible portion of
`@counterfact/types` under `dist/templates/counterfact-types`. Runtime-only
shared values are excluded so generated projects retain their existing file
contract.

See [`examples/generate-routes.mjs`](./examples/generate-routes.mjs) for a
complete public-import example.

## Customize schema types

Pass a synchronous `schemaTypeTransform` to `CodeGenerator` to customize the
TypeScript type generated for a JSON Schema. The callback receives the schema,
Counterfact's default `ts.TypeNode`, and a small script facade for named type
imports. Return the default node to preserve it, or return a new type node.

```ts
import {
  CodeGenerator,
  type SchemaTypeTransform,
} from "@counterfact/generator";
import ts from "typescript";

const schemaTypeTransform: SchemaTypeTransform = (
  schema,
  defaultType,
  script,
) => {
  if (typeof schema === "object" && schema.format === "uuid") {
    const brand = script.importType("@example/domain", "UUIDBrand");
    return ts.factory.createIntersectionTypeNode([defaultType, brand]);
  }
  return defaultType;
};

await new CodeGenerator("./openapi.yaml", "./api", {
  routes: true,
  types: true,
  schemaTypeTransform,
}).generate();
```

The example assumes `@example/domain` exports a `UUIDBrand` type suitable for
intersecting with the generated type, such as `{ readonly __brand: "UUID" }`.
Install that package in the generated project's environment. For a complete
runnable generation example, see
[`examples/customize-schema-types.mjs`](./examples/customize-schema-types.mjs).

The public types are `JsonSchema`, `SchemaTypeTransform`, and `SchemaTypeScript`.
`JsonSchema` accepts schema objects, including OpenAPI/vendor extensions, and
boolean schemas. Treat schemas and input AST nodes as immutable; use TypeScript
factory/update functions to produce changed nodes. Use a compatible TypeScript
compiler API version (the generator pins its compiler dependency).

### Callback behavior

- Inline schemas and referenced definitions are transformed after their default
  generation. Child schemas are transformed before their containers. Ordinary
  `$ref` sites keep pointing to the transformed definition and do not invoke the
  callback again. The schema is the generator's bundled input, after overlays.
- A parent replacement can discard child changes. Parent schema constraints can
  refine a child's result, for example by adding discriminator tags.
- Configuration is scoped to the generator or repository instance and survives
  regeneration and `watch()`. Do not depend on callback counts or ordering across
  output files. Keep results deterministic for the same inputs.
- To share output across generators (including API versions), construct
  `new Repository({ schemaTypeTransform })` and pass it to `generate(repository)`.
  If you also set the generator option, use the same callback on both instances.
- `script.importType(moduleSpecifier, exportedName)` registers a named, type-only
  import and returns its aliased `TypeReferenceNode`. Repeated requests share an
  import; equal names from different modules remain distinct. Aliases avoid
  shadowing standard TypeScript types. Package specifiers work across output
  files; relative specifiers are relative to each generated file.
- Imports no longer referenced after a type replacement are omitted. Default
  generation still takes place, so referenced files may still be generated even
  if their types are replaced. This hook cannot bypass a default-generation error.
- Throwing, returning a Promise, or returning a non-type node fails generation
  with a schema-location diagnostic. There is no fallback to `unknown` for a
  customization failure.
- This API changes generated types only. It does not convert runtime values,
  change request/response validation, or change route-preservation behavior.

For CLI projects, set `schema-type-transform: ./schema-type-transform.mjs` in
`counterfact.yaml`. The module must default-export the callback; its path is
relative to the config file. See the [Counterfact configuration reference](../counterfact/docs/api/cli.md#customize-generated-schema-types).
