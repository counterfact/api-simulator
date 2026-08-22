# `@counterfact/runtime`

Counterfact's HTTP runtime, route and context registries, module loading,
validation, proxying, hot reload, Koa integration, and MSW adapter.

Import core registries and dispatch contracts from `@counterfact/runtime`, the
Koa adapter from `@counterfact/runtime/koa`, and the MSW adapter from
`@counterfact/runtime/msw`. Counterfact uses only these declared exports.

See [`examples/registries.mjs`](./examples/registries.mjs) for a complete
public-import example.

## HTTP response fault injection

`ChaosRegistry` owns fluent rules that can alter a dispatcher's status, delay,
headers, or body after normal response processing:

```js
import { ChaosRegistry } from "@counterfact/runtime";

const chaosRegistry = new ChaosRegistry();
chaosRegistry
  .createRule("/orders")
  .next(3)
  .probability(0.5)
  .status(503)
  .header("Retry-After", "1");
```

Rules apply indefinitely by default. `Content-Type` cannot be changed or
removed by a chaos rule.
