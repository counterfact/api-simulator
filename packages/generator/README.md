# `@counterfact/generator`

Private workspace package for generating Counterfact route scaffolds,
OpenAPI-derived TypeScript contracts, scenario types, and compatible local
`counterfact-types` templates.

The package boundary is intentionally small while extraction is in progress:
`CodeGenerator`, `ScenarioFileGenerator`, and `Repository` support the
`counterfact` facade, `generateVersionsTsContent` supports multi-version
projects, and `buildOperationTypeNameMapping` supports legacy route migration.
Concrete coders remain private implementation details.

The build carries the generated-handler-compatible portion of
`@counterfact/types` under `dist/templates/counterfact-types`. Runtime-only
shared values are excluded so generated projects retain their existing file
contract.
