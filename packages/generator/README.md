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
