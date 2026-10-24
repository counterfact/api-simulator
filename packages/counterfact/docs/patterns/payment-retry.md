# Test a payment decline, retry, and reset

This recipe gives a test runner a complete local workflow: an empty order collection, a declined payment, a successful retry, a denied permission, and a fresh baseline. It models client-visible outcomes; it does not verify a payment provider or production authorization.

## Install and generate

Follow the [project installation setup](./lifecycle-setup.md), then keep the contract, authored code, and verification script together in that project for review.

Save this as `orders.yaml`:

```yaml
openapi: 3.0.3
info: { title: Order workflow, version: 1.0.0 }
paths:
  /orders:
    post:
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [id]
              properties:
                id: { type: string }
      responses:
        "201":
          description: Order placed
          content:
            application/json:
              schema:
                type: object
                required: [id]
                properties:
                  id: { type: string }
        "402": { description: Payment declined }
        "403": { description: Permission denied }
  /orders/{orderId}:
    get:
      parameters:
        - name: orderId
          in: path
          required: true
          schema: { type: string }
      responses:
        "200":
          description: Order found
          content:
            application/json:
              schema:
                type: object
                required: [id]
                properties:
                  id: { type: string }
        "404": { description: Order absent }
```

Generate the project once:

```sh
npx --no-install counterfact orders.yaml api --generate --no-update-check
```

## Define the state and HTTP behavior

Replace `api/routes/_.context.ts`:

```ts
export class Context {
  paymentOutcome: "approved" | "declined" = "approved";
  canPlaceOrders = true;
  private orders = new Set<string>();

  placeOrder(id: string): "placed" | "declined" | "forbidden" {
    if (!this.canPlaceOrders) return "forbidden";
    if (this.paymentOutcome === "declined") return "declined";
    this.orders.add(id);
    return "placed";
  }

  hasOrder(id: string): boolean {
    return this.orders.has(id);
  }
}
```

Replace the generated handlers:

```ts
// api/routes/orders.ts
import type { HTTP_POST } from "../types/paths/orders.types.js";

export const POST: HTTP_POST = function ($) {
  const outcome = $.context.placeOrder($.body.id);
  if (outcome === "forbidden") return $.response.status(403).empty();
  if (outcome === "declined") return $.response.status(402).empty();
  return $.response.status(201).json({ id: $.body.id });
};
```

```ts
// api/routes/orders/{orderId}.ts
import type { HTTP_GET } from "../../types/paths/orders/{orderId}.types.js";

export const GET: HTTP_GET = function ($) {
  return $.context.hasOrder($.path.orderId)
    ? $.response.status(200).json({ id: $.path.orderId })
    : $.response.status(404).empty();
};
```

Create `api/scenarios/index.ts`:

```ts
import type { Scenario } from "../types/_.context.js";

export const declinedPayment: Scenario = ($) => {
  $.context.paymentOutcome = "declined";
};

export const approvedPayment: Scenario = ($) => {
  $.context.paymentOutcome = "approved";
};

export const forbiddenOrders: Scenario = ($) => {
  $.context.canPlaceOrders = false;
};
```

Each scenario changes only its named condition. For example, applying `approvedPayment` after `forbiddenOrders` does not restore permission. `reset()` is the explicit operation that rebuilds the empty collection and default flags from the constructor. One order is enough here because the test asks whether a single attempted action was recorded.

## Verify over real HTTP

Save as `verify-orders.mjs` and run `node verify-orders.mjs`:

```js
import assert from "node:assert/strict";
import { counterfact } from "counterfact";

const api = await counterfact({
  basePath: "api",
  openApiPath: "orders.yaml",
  port: 0,
  generate: { routes: false, types: false },
  watch: { routes: false, types: false },
});
const { stop } = await api.start();
try {
  const address = api.status().address;
  assert.ok(address);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const read = (id) => fetch(`${baseUrl}/orders/${id}`);
  const place = (id) =>
    fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
  const expectStatus = async (responsePromise, status) => {
    const response = await responsePromise;
    const body = await response.text();
    assert.equal(response.status, status, body);
    assert.equal(response.headers.get("response-type-error"), null);
  };

  await api.reset();
  await api.scenario("declinedPayment");
  await expectStatus(read("order-juniper"), 404);
  await expectStatus(place("order-juniper"), 402);
  await expectStatus(read("order-juniper"), 404);

  await api.scenario("approvedPayment");
  await expectStatus(place("order-juniper"), 201);
  const found = await read("order-juniper");
  assert.equal(found.status, 200);
  assert.deepEqual(await found.json(), { id: "order-juniper" });

  await api.scenario("forbiddenOrders");
  await api.scenario("approvedPayment");
  await expectStatus(place("order-maple"), 403);
  await expectStatus(read("order-juniper"), 200);
  await expectStatus(read("order-maple"), 404);

  await api.reset();
  await expectStatus(read("order-juniper"), 404);
  await expectStatus(place("order-maple"), 201);
  console.log("Passed: decline, retry, permission composition, and reset");
} finally {
  await stop();
}
```

Consuming each response before reset keeps this sequence free of outstanding work. The header assertion turns supported advisory response-validation errors into test failures; it does not add response-body validation. Assertions on JSON above cover only the behavior explicitly exercised.

For parallel CI, use [one simulator per worker](./automated-integration-tests.md#playwright-one-simulator-per-worker), keep the assigned address with that worker, and await reset before each test. Readiness from `start()` means the listener is bound; a representative HTTP assertion establishes that the intended application route works. Retain targeted tests against the real backend for payment semantics, permission enforcement, and other behavior the model omits.
