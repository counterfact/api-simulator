# Contexts, stores, and scenarios

## Context modules

Export `class Context` from `routes/_.context.ts` or a nested `_.context.ts`. Routes use the nearest context as `$.context`. Constructors receive helpers; import the generated `Context$` type from the corresponding `types/_.context.js` file.

| Constructor member  | Purpose                                                  |
| ------------------- | -------------------------------------------------------- |
| `loadContext(path)` | Access another context by route path.                    |
| `readJson(path)`    | Asynchronously load JSON relative to the context module. |
| `store`             | Access the optional application-level store.             |

## Store module

Export `class Store` from `<basePath>/_.store.ts`. Counterfact creates one store per simulator and supplies it to contexts across API groups. Routes, middleware, and scenarios access shared behavior through contexts; their `$` argument has no direct `store` member.

The store survives hot reload and stop/start on the same simulator. `reset()` reconstructs it. See [shared store](../patterns/shared-store.md) for supported reload behavior.

## Scenario modules

Export named functions from files under `scenarios/`. A scenario receives `context`, `loadContext`, `route`, and `routes` on its `$` argument. An exported `startup` function in `scenarios/index.ts` runs during startup and reset, once per group. Named scenarios transform current state; compose focused changes rather than implicitly replacing the entire world.

See [scenario scripts](../patterns/scenario-scripts.md) for function selection and additional helper arguments, and [simulator lifecycle](./simulator.md) for reset behavior.

## Middleware

Export `middleware` from a route subtree's `_.middleware.ts`, using its generated `Middleware` type. Its signature is `async ($, respondTo) => response`. Return an early response or call and await `respondTo($)` to continue through the subtree. See [middleware](../features/middleware.md).
