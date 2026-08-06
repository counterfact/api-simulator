# `src/typescript-generator/` — TypeScript Generator

The files in this directory implement a code generator that takes an OpenAPI spec as input and translates it into TypeScript code. That TypeScript code includes types corresponding to each of the models ("components" or "schemas" in OpenAPI parlance). It also scaffolds out an implementation of the spec in the form of TypeScript files that are read by Counterfact.

A spec doesn't have enough information to build a _real_ implementation — it only describes the interfaces — but we use whatever information is available to get as close as we can to a full implementation. When the specification has example responses, it will randomly select an example and return it. Otherwise it will generate a structurally valid albeit nonsensical response.

The idea is to generate as much code as we possibly can and then edit the code to fill in the details.

Fortunately, we _do_ have pretty much all the information we need to generate _types_. Once that code is generated, there's no reason to touch it manually. If the spec changes, we can rerun the generator. It will recreate the types _only_. We can then leverage the type system to figure out what parts of our manually edited code need to be updated.

We can also use those types on the _client_ side, assuming the client is written in TypeScript.

## Files

| File | Description |
|---|---|
| `code-generator.ts` | Top-level `CodeGenerator` class; orchestrates the full generate pipeline (reads the OpenAPI spec, iterates over paths/operations, drives the `Repository` to write output files) and file watching via `EventTarget` |
| `specification.ts` | `Specification` class: loads and parses an OpenAPI document and provides cached `Requirement` lookup via JSON Pointer |
| `requirement.ts` | `Requirement` class: wraps a single OpenAPI schema object with its URL and resolves `$ref` pointers |
| `repository.ts` | `Repository` class: manages all output `Script` instances, deduplicates them, and coordinates async export resolution |
| `script.ts` | `Script` class: manages code generation for a single output file — imports, exports, deduplication, and Prettier formatting |
| `coder.ts` | Abstract `Coder` base class: defines the Template Method pattern used by all code-generating components |
| `type-coder.ts` | Abstract `TypeCoder` base class (extends `Coder`): specialises `Coder` for type-generating components |
| `operation-coder.ts` | `OperationCoder`: generates the route handler function for an OpenAPI operation |
| `operation-type-coder.ts` | `OperationTypeCoder`: generates the TypeScript type for a route handler, including parameters and response builder |
| `parameters-type-coder.ts` | `ParametersTypeCoder`: generates the typed object for path/query/header parameters of an operation |
| `parameter-export-type-coder.ts` | `ParameterExportTypeCoder`: generates and exports the type for a single request parameter |
| `responses-type-coder.ts` | `ResponsesTypeCoder`: generates the response builder factory type covering all HTTP status codes for an operation |
| `response-type-coder.ts` | `ResponseTypeCoder`: generates the type for a single HTTP response, including headers, content, and named examples |
| `schema-type-coder.ts` | `SchemaTypeCoder`: converts an OpenAPI schema definition to a TypeScript type (objects, arrays, unions, enums) |
| `schema-coder.ts` | `SchemaCoder`: generates a JSON Schema representation of an OpenAPI schema for use in runtime validation |
| `context-file-token.ts` | Exports a placeholder token used to reference context file paths during code generation |
| `printers.ts` | Utility functions for formatting TypeScript object literals in generated code |
| `read-only-comments.ts` | Standard warning comments inserted into generated type files to discourage manual edits |

## Architecture

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

Our goal is to produce a file at `/routes/hello.ts` that exports a function named `GET` (1). Our implementation will depend on a type for the `GET` function which lives in `/routes/types-hello.ts` (2). That type, in turn, will depend on a type named `Message` which lives in `/components/message.ts` (3).

(1) We kick off the process by iterating over the paths. (In our simple example there's only one path, at `/hello`.) In our model, each path is represented as a `Requirement`. We give each path / `Requirement` to an `OperationCoder` who will write the code. We ask the repository for a `Script` and then hand the `Script` our `OperationCoder` instance and ask it to create an export.

(2a) The `OperationCoder` knows that the function has to have a type, but it doesn't know to create that type. So it recruits an `OperationTypeCoder` and hands it the `Requirement`. It then asks the `Script` to _import_ a type, passing along the `OperationTypeCoder`. The `Script` returns the name of the variable to which the imported type will be assigned. That name is all the `OperationCoder` needs to know to continue writing its portion of the code. The `OperationCoder` continues on, writing the `GET` function. Depending on what it finds in the `Requirement`, it will break off parts and delegate some of the work to other `Coder`s.

(2b) The `Script` has promised that it will import the type from `/types/paths/hello.type.ts` so it needs to make sure that file exists and has a matching export. It goes to the repository to get another `Script` and asks it to _export_ the type, passing along the `OperationTypeCoder` in the process. It's a little tricky here because `OperationTypeCoder`'s `Requirement` may not have the information it needs to proceed. It might have a `$ref` pointer to some _other_ requirement that might be in a different file. So before asking for the export, it asks the `OperationTypeCoder` to give it _another_ `OperationTypeCoder` that definitely has the requirement. Because the other requirement may be in another file that the `Repository` hasn't loaded yet, this part happens asynchronously.

(2c) When it's ready, the `Script` asks the `OperationTypeCoder` which definitely has an immediately usable requirement to write the export for the `Script` at `/types/paths/hello.types.ts`.

(3) The `OperationTypeCoder` needs the help of a `SchemaCoder` so it asks the `Script` at `/types/paths/hello.types.ts` for an export...
