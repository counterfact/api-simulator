---
"@counterfact/generator": minor
"counterfact": minor
---

Add a programmatic `schemaTypeTransform` callback that customizes inline and
referenced schema types using TypeScript AST nodes. A script facade registers
aliased external type imports. Customization errors fail generation with a
schema location; runtime validation and conversion remain unchanged.

Configure the callback from `counterfact.yaml` with a `schema-type-transform`
module path. The callback is applied during CLI generation, specification
watching, and shared versioned generation. Export the callback types from
`counterfact` for configuration-module authors.
