# Generator internals

The files in this directory implement a code generator that takes an OpenAPI spec as input and translates it into TypeScript code. That TypeScript code includes types corresponding to each of the models ("components" or "schemas" in OpenAPI parlance). It also scaffolds out an implementation of the spec in the form of TypeScript files that are read by Counterfact.

A spec doesn't have enough information to build a _real_ implementation — it only describes the interfaces — but we use whatever information is available to get as close as we can to a full implementation. When the specification has example responses, it will randomly select an example and return it. Otherwise it will generate a structurally valid albeit nonsensical response.

The idea is to generate as much code as we possibly can and then edit the code to fill in the details.

Fortunately, we _do_ have pretty much all the information we need to generate _types_. Once that code is generated, there's no reason to touch it manually. If the spec changes, we can rerun the generator. It will recreate the types _only_. We can then leverage the type system to figure out what parts of our manually edited code need to be updated.

We can also use those types on the _client_ side, assuming the client is written in TypeScript.

## Public generated types

Generated projects expose `Routes`, `Components`, and `Schemas` through
`types/index.ts`. Routes import `Routes` from that entry point and use
`Routes["/hello-world"]["GET"]`; model consumers use `Schemas["Message"]`
or `Components["schemas"]["Message"]`. Direct imports of operation and
component types are deprecated for consumers.

The individual operation and component modules remain generator implementation
and compatibility surfaces. Internal coders continue importing dependencies
directly. `central-types.ts` registers operations and all declared components,
then emits the central maps after the repository has resolved their types.
The central entry point also re-exports `Context$`, `Scenario`, `Scenario$`, and
the directory-indexed `Middleware` map from `types/helpers.ts`. Helper generation
and context watching own that module; OpenAPI generation owns the API maps.
Both writers serialize helper updates without rewriting each other's exports.

## Files

| File                             | Description                                                                                                                                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code-generator.ts`              | Top-level `CodeGenerator` class; orchestrates the full generate pipeline (reads the OpenAPI spec, iterates over paths/operations, drives the `Repository` to write output files) and file watching via `EventTarget` |
| `specification.ts`               | `Specification` class: loads and parses an OpenAPI document and provides cached `Requirement` lookup via JSON Pointer                                                                                                |
| `requirement.ts`                 | `Requirement` class: wraps a single OpenAPI schema object with its URL and resolves `$ref` pointers                                                                                                                  |
| `repository.ts`                  | `Repository` class: manages all output `Script` instances, deduplicates them, and coordinates async export resolution                                                                                                |
| `script.ts`                      | `Script` class: manages code generation for a single output file — imports, exports, deduplication, and Prettier formatting                                                                                          |
| `coder.ts`                       | Abstract `Coder` base class: defines the Template Method pattern used by all code-generating components                                                                                                              |
| `type-coder.ts`                  | Abstract `TypeCoder` base class (extends `Coder`): specialises `Coder` for type-generating components                                                                                                                |
| `central-types.ts`               | Assembles the public `Routes`, `Components`, and `Schemas` maps, preserving logical paths and combining component versions                                                                                           |
| `operation-coder.ts`             | `OperationCoder`: generates the route handler function for an OpenAPI operation                                                                                                                                      |
| `operation-type-coder.ts`        | `OperationTypeCoder`: generates the TypeScript type for a route handler, including parameters and response builder                                                                                                   |
| `parameters-type-coder.ts`       | `ParametersTypeCoder`: generates the typed object for path/query/header parameters of an operation                                                                                                                   |
| `parameter-export-type-coder.ts` | `ParameterExportTypeCoder`: generates and exports the type for a single request parameter                                                                                                                            |
| `responses-type-coder.ts`        | `ResponsesTypeCoder`: generates the response builder factory type covering all HTTP status codes for an operation                                                                                                    |
| `response-type-coder.ts`         | `ResponseTypeCoder`: generates the type for a single HTTP response, including headers, content, and named examples                                                                                                   |
| `schema-type-coder.ts`           | `SchemaTypeCoder`: converts an OpenAPI schema definition to a TypeScript type (objects, arrays, unions, enums)                                                                                                       |
| `schema-coder.ts`                | `SchemaCoder`: generates a JSON Schema representation of an OpenAPI schema for use in runtime validation                                                                                                             |
| `ast.ts`                         | TypeScript AST construction and printing helpers                                                                                                                                                                     |
| `read-only-comments.ts`          | Standard warning comments inserted into generated type files to discourage manual edits                                                                                                                              |

## Architecture

### AST assembly

Type coders compose `TypeNode`s, and runtime coders compose `Expression`s through
`write()`. `Script` assembles import, export, and version declarations into a
`SourceFile`; the TypeScript printer emits it before Prettier formats the result.
Versioned operations register declaration builders rather than raw source text.
Context imports resolve their module paths before printing.

The standalone versions, scenario, middleware, and starter-file generators use
the same AST helpers. Repository regeneration reads existing route ASTs to find
exported handlers and imports, then inserts printed declarations without
reprinting user-authored text.

`ast.ts` centralizes printing, literal property names, type references, and
synthetic JSDoc. TypeScript is an explicit, pinned generator dependency because
its compiler API is used when the installed package generates files.

Keep OpenAPI traversal and file-writing policy separate from AST construction.
Existing route edits must survive regeneration, including when new handlers are
added. Check generated assignment behavior as well as snapshots when changing
type composition.

```
openapi.yaml
     │
     ▼
┌─────────────────┐
│  Specification  │  Loads & parses the OpenAPI document
│  + Requirement  │  Provides JSON-Pointer-based object lookup
└────────┬────────┘
         │ Requirements
         ▼
┌──────────────────────────────────────────────────────┐
│                      Coders                          │
│                                                      │
│  OperationCoder ──▶ OperationTypeCoder               │
│       │                    │                         │
│       │             ParametersTypeCoder              │
│       │             ResponsesTypeCoder               │
│       │                    │                         │
│       │             SchemaTypeCoder / SchemaCoder    │
│       │                                              │
│       └──▶ Script (one per output file)              │
└──────────────────┬───────────────────────────────────┘
                   │ Scripts
                   ▼
          ┌────────────────┐
          │   Repository   │  Deduplicates and writes output files
          └────────────────┘
                   │
          ┌────────▼────────────────────────┐
          │  routes/hello-world.ts          │  (route handler scaffold)
          │  types/paths/hello-world.ts     │  (typed interfaces)
          │  components/schemas/Message.ts  │  (schema types)
          └─────────────────────────────────┘
```

A **Specification** is a list of **Requirements** encoded in an OpenAPI file.

A **Repository** is a set of **Scripts** that will be output.

A **Coder** is a command object that reads a particular type of requirement from the specification and turns it into code. Coders collaborate. A coder may do all of the work itself, but most of the time it will split up the requirement into smaller pieces and recruit other coders to help.

A **Specification** encapsulates an openapi.yaml file and all of the files that it references (and all of the files that they reference...). We reference individual objects within the specification via [JSON pointer](https://datatracker.ietf.org/doc/html/rfc6901) URLs.

How does this work? Let's explore by looking at a very simple OpenAPI Spec:

```yaml
openapi: 3.0.3
info:
  version: 1.0.0
  title: Sample API
  description: A sample API to illustrate OpenAPI concepts
paths:
  /hello-world:
    get:
      description: hello world
      responses:
        default:
          description: Successful response
          content:
            application/json:
              schema:
                type:
                  $ref: /Components/schemas/Message
              examples:
                no visits:
                  value:
                    greeting: Hello
                    object: World
  components:
    schemas:
      Message:
        schema:
          type: object
          properties:
            greeting:
              type: string
            object:
              type: string
```

Our goal is to produce `routes/hello-world.ts`, exporting a `GET` handler typed
as `Routes["/hello-world"]["GET"]`, and a reusable model available as
`Schemas["Message"]`.

1. `CodeGenerator` registers every declared component with the central index,
   including unused schemas. It traverses path operations and exports each
   `OperationCoder` to its route script.
2. `OperationCoder.typeDeclaration()` registers its `OperationTypeCoder` with
   the central index and imports `Routes` into the route. The index imports the
   handler contract from its existing operation module. Versioned operations
   still register each version's argument type on the shared operation script.
3. The operation contract uses other coders for parameters, responses, and
   schemas. `Script.importType()` resolves their exports through `Repository`,
   keeping those internal imports direct and collision-safe.
4. After all types resolve, the central script emits `Routes`, `Components`,
   and `Schemas = Components["schemas"]` through a deferred statement builder.
   `Repository` writes regenerated types and preserves user-edited route text.
