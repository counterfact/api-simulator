---
"@counterfact/generator": minor
---

Add a programmatic `schemaTypeTransform` callback that customizes inline and
referenced schema types using TypeScript AST nodes. A script facade registers
aliased external type imports. Customization errors fail generation with a
schema location; runtime validation and conversion remain unchanged.
