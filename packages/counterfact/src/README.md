# `src/` — Source Directory

This directory contains all of the runtime source code for Counterfact. The entry point for the library API is `app.ts`. Each subdirectory contains a cohesive set of modules; see the README in each subdirectory for details.

## Subdirectories

| Directory                                                | Description                                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`repl/`](./repl/README.md)                              | Interactive REPL for inspecting and controlling a running server                             |
| [`@counterfact/generator`](../../../generator/README.md) | Workspace package that reads an OpenAPI spec and produces typed TypeScript route scaffolding |
| [`@counterfact/runtime`](../../../runtime/README.md)     | Workspace package that dispatches routes and owns the HTTP, Koa, and MSW runtime             |
| [`migrate/`](./migrate/README.md)                        | One-time migration utilities for upgrading the generated file structure                      |
| [`util/`](./util/README.md)                              | Small, general-purpose helper functions shared across the codebase                           |

## Files

| File     | Description                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app.ts` | Top-level orchestrator; wires together the code generator, transpiler, module loader, Koa app, and REPL into a single `counterfact()` factory function |

Shared route and middleware contracts live in the sibling
[`@counterfact/types`](../../types/README.md) workspace. Counterfact copies
those source contracts into generated projects to preserve their existing
self-contained import paths.

The server, dispatcher, registries, module loading, validation, and Koa/MSW
adapters live in the sibling
[`@counterfact/runtime`](../../runtime/README.md) workspace. This facade wires
that runtime to generation, the CLI, telemetry policy, and the REPL.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                        app.ts                            │
│                                                          │
│  ┌──────────────┐   ┌────────────┐   ┌───────────────┐  │
│  │ CodeGenerator│   │ Transpiler │   │  ModuleLoader │  │
│  │ (gen/watch)  │──▶│ (TS → CJS) │──▶│ (load/watch)  │  │
│  └──────────────┘   └────────────┘   └───────┬───────┘  │
│                                               │          │
│  ┌──────────────┐   ┌────────────┐   ┌───────▼───────┐  │
│  │     REPL     │   │  KoaApp    │   │   Registry    │  │
│  │  (optional)  │   │ (HTTP srv) │◀──│ ContextReg.   │  │
│  └──────────────┘   └─────┬──────┘   └───────────────┘  │
│                            │                             │
│                     ┌──────▼──────┐                      │
│                     │ Dispatcher  │                      │
│                     │ (routing)   │                      │
│                     └─────────────┘                      │
└──────────────────────────────────────────────────────────┘
```

1. **CodeGenerator** reads the OpenAPI spec and writes `.ts` route and type files.
2. **Transpiler** compiles those `.ts` files to `.cjs` files in a `.cache/` directory and watches for changes.
3. **ModuleLoader** imports the compiled modules, populates the **Registry** and **ContextRegistry**, and hot-reloads on file changes.
4. **Dispatcher** handles each incoming HTTP request by looking up the matching route in the Registry and invoking the handler.
5. **KoaApp** wraps the Dispatcher in a Koa HTTP server with additional middleware for the admin API, OpenAPI UI, and static pages.
6. **REPL** (optional) provides an interactive shell connected to the ContextRegistry.
