# Contexts, stores, and scenarios

For definitions of contexts, scenarios, and API groups, read [how state fits together](../manual/concepts.md#context-state-shared-by-nearby-routes). `basePath` is the output directory. The constructor, scenario, and middleware arguments below have [different capabilities](../manual/concepts.md#function-arguments).

## Context modules

Export `class Context` from `routes/_.context.ts` or a nested `_.context.ts`. Routes use the nearest context as `$.context`. Constructors receive helpers; import the generated `Context$` type from the generated `types/index.js` entry point.

| Constructor member  | Purpose                                                  |
| ------------------- | -------------------------------------------------------- |
| `loadContext(path)` | Access another context by route path.                    |
| `readJson(path)`    | Asynchronously load JSON relative to the context module. |
| `store`             | Access the optional application-level store.             |

### `loadContext(path: string)`

Returns the live context nearest to the supplied route path, checking that path and then its parents. Lookup is case-insensitive and falls back to the root context at `/`; it does not return `undefined` merely because no exact context exists. Generated `Context$` overloads provide the types for known paths.

Constructor lookup stays within the current API group. A URL prefix does not select another group. Use a [shared store](../patterns/shared-store.md) for data needed across groups. During reset, a constructor dependency cycle rejects reset. Prefer request-time lookup inside a method when connecting contexts, as in [nested and connected contexts](../manual/nested-contexts.md).

### `readJson(relativePath: string): Promise<unknown>`

Reads and parses a JSON file asynchronously. The path resolves relative to the source `_.context.ts` module, rather than the process working directory or compiled cache. The promise resolves to the parsed JSON value as `unknown`; validate or narrow it before using application-specific fields.

The promise rejects if the file cannot be read or does not contain valid JSON. Errors identify the resolved file; read failures also identify the supplied path and context directory. See [loading JSON data](../features/state.md#loading-json-data-with-readjson) for an example that stores the helper for later calls.

## Store module

Export `class Store` from `<basePath>/_.store.ts`. Counterfact creates one store per simulator and supplies it to contexts across API groups. Routes, middleware, and scenarios access shared behavior through contexts; their `$` argument has no direct `store` member.

The store survives hot reload and stop/start on the same simulator. `reset()` reconstructs it. See [shared store](../patterns/shared-store.md) for supported reload behavior.

## Scenario modules

Export named functions from files under `scenarios/`. A scenario receives `context`, `loadContext`, `route`, and `routes` on its `$` argument. An exported `startup` function in `scenarios/index.ts` runs during startup and reset, once per group. Named scenarios transform current state; compose focused changes rather than implicitly replacing the entire world.

See [scenario scripts](../patterns/scenario-scripts.md) for function selection and additional helper arguments, and [simulator lifecycle](./simulator.md) for reset behavior.

## Middleware

Export `middleware` from a route subtree's `_.middleware.ts`, using `Middleware["/directory"]` from the generated `types/index.js` entry point (`Middleware["/"]` at the root). Its signature is `async ($, respondTo) => response`. Return an early response or call and await `respondTo($)` to continue through the subtree. See [middleware](../features/middleware.md).
