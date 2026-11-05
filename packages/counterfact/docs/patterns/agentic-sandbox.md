# AI-assisted workflows

The [REPL](../features/repl.md) is Counterfact’s live terminal prompt. A [context](../features/state.md) is your state class; a context at `routes/_.context.ts` serves nested routes until a nearer context replaces it.

Point your coding agent at a local API with known responses. Give it a specific task and tests you can run yourself.

## Point a third-party SDK at a local API

An SDK can keep its normal calls while its base URL points at Counterfact. This
small example uses the **server-side Stripe Node SDK**. It models only a
customer lookup and a rate-limit response. The contract is a small subset,
not Stripe's complete schema, and the example does not prove Stripe compatibility.

In a new directory, run:

```sh
npm init -y
npm install --save-dev --save-exact counterfact stripe@23.0.1
```

Commit the resulting lockfile. Save this local contract as `customers.yaml`:

```yaml
openapi: 3.0.3
info: { title: Local customer lookup, version: 1.0.0 }
paths:
  /v1/customers/{customerId}:
    get:
      parameters:
        - name: customerId
          in: path
          required: true
          schema: { type: string }
      responses:
        "200":
          description: Customer found
          content:
            application/json:
              schema:
                type: object
                required: [id, object, email]
                properties:
                  id: { type: string }
                  object: { type: string, enum: [customer] }
                  email: { type: string }
        "429":
          description: Rate limited
          content:
            application/json:
              schema:
                type: object
                required: [error]
                properties:
                  error:
                    type: object
                    required: [type, message]
                    properties:
                      type: { type: string }
                      message: { type: string }
```

Generate editable routes, then add the two files below:

```sh
npx counterfact customers.yaml api --generate --no-update-check
```

```ts
// api/routes/_.context.ts
export class Context {
  rateLimited = false;
}
```

```ts
// api/routes/v1/customers/{customerId}.ts
import type { Routes } from "../../../types/index.js";

type Route = Routes["/v1"]["/customers"]["/{customerId}"];

export const GET: Route["GET"] =
  function ($) {
    if ($.context.rateLimited) {
      return $.response.status(429).json({
        error: { type: "rate_limit_error", message: "Try again shortly" },
      });
    }
    return $.response.status(200).json({
      id: $.path.customerId,
      object: "customer",
      email: "juniper@example.test",
    });
  };
```

Start the local server and REPL in the same directory:

```sh
npx counterfact customers.yaml api --serve --repl --no-update-check
```

Save this as `sdk-client.mjs`. The SDK's [host, port, and protocol options](https://github.com/stripe/stripe-node#configuration)
select the local server. This script uses a placeholder key, disables SDK
telemetry, sets a five-second timeout, and disables automatic network retries so
one SDK call exercises one response.

```js
import assert from "node:assert/strict";
import Stripe from "stripe";

const local = new URL(process.env.API_BASE_URL ?? "http://127.0.0.1:3100");
assert.equal(local.hostname, "127.0.0.1");
assert.equal(local.protocol, "http:");
const stripe = new Stripe("sk_test_local_placeholder", {
  host: local.hostname,
  port: Number(local.port),
  protocol: "http",
  maxNetworkRetries: 0,
  timeout: 5_000,
  telemetry: false,
});

if (process.argv.includes("--rate-limited")) {
  await assert.rejects(stripe.customers.retrieve("cus_local"), (error) => {
    assert.equal(error.statusCode, 429);
    assert.equal(error.message, "Try again shortly");
    return true;
  });
  console.log("SDK observed the simulated rate limit");
} else {
  const customer = await stripe.customers.retrieve("cus_local");
  assert.equal(customer.id, "cus_local");
  assert.equal(customer.email, "juniper@example.test");
  console.log("SDK read the local customer");
}
```

In a second terminal, run `node sdk-client.mjs` and expect
`SDK read the local customer`. At the Counterfact REPL, set
`context.rateLimited = true`. Run `node sdk-client.mjs --rate-limited` and expect
`SDK observed the simulated rate limit`. Set `context.rateLimited = false` and
rerun the first command to confirm recovery.

These checks show SDK traffic reaching the local handler and the SDK surfacing
a simulated error. They do not validate production authentication, Stripe's full
customer object, or SDK retry timing. Keep separate real-service checks for the
parts of the integration your client relies on.

<span id="prepare-a-repeatable-api-world"></span>

## Set up the API for repeatable tests

1. Follow the [project installation setup](./lifecycle-setup.md) and commit the dependency lockfile.
2. Complete the [payment retry recipe](./payment-retry.md) in that setup. It supplies a checked-in contract, small context, typed HTTP handlers, named scenarios, and an executable verification script.
3. Record the implementation commit and dependency lockfile. For a third-party API, keep a reviewed specification snapshot rather than loading a mutable remote branch on each run.
4. Replace generated random responses on the exercised operations with fixed or deterministic behavior. Reset and locality do not make `.random()` repeatable.

This example uses a deliberately small order/payment model. Adapt it to the client workflow; do not ask an agent to infer a production payment system from the contract.

<span id="give-the-agent-a-bounded-task"></span>

## Give the agent a specific task

For example:

```text
Implement the client order flow against the checked-in orders.yaml contract.
Use the supplied Counterfact handlers and scenarios. Do not change the contract
or relax the verification assertions to make the client pass.
Show an empty state, a declined submission, a successful retry, and a denied
permission. Keep failures controlled by the named scenarios, not magic IDs.
Run verify-orders.mjs and the client tests. Report both the simulated evidence
and assumptions that still require a real-backend test.
```

Run the TypeScript compiler to check request and response types. Use HTTP tests to check the behavior you asked the agent to implement. Test against the real backend for behavior the simulation does not cover.

## Run without a REPL

The payment recipe's `verify-orders.mjs` is a complete noninteractive example: it awaits `start()`, reads the allocated address, resets, applies scenarios, makes real HTTP assertions, and always awaits `stop()`.

For an agent's client test command, use the same lifecycle and pass the actual address to that command. Save as `verify-client-flow.mjs` alongside the payment recipe:

```js
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { counterfact } from "counterfact";

const run = promisify(execFile);
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
  await api.reset();
  await api.scenario("declinedPayment");
  const probe = await fetch(`${baseUrl}/orders/order-juniper`);
  assert.equal(probe.status, 404);
  await probe.text();
  const { stdout } = await run(process.execPath, ["client-flow.mjs"], {
    env: { ...process.env, API_BASE_URL: baseUrl },
    timeout: 60_000,
  });
  console.log(JSON.stringify({ scenario: "declinedPayment", baseUrl, stdout }));
} finally {
  await stop();
}
```

Here `client-flow.mjs` is the client verification the agent supplies. A minimal HTTP client check for this starting state is:

```js
// client-flow.mjs
import assert from "node:assert/strict";
const response = await fetch(`${process.env.API_BASE_URL}/orders`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ id: "order-juniper" }),
});
const body = await response.text();
assert.equal(response.status, 402, body);
assert.equal(response.headers.get("response-type-error"), null);
console.log("Client observed a declined payment");
```

Run `node verify-client-flow.mjs`. `start()` establishes listener readiness; the probe checks a representative application route in the selected state. The timeout makes a stalled client command fail. A nonzero child exit rejects the runner, and `finally` still shuts down the simulator. The separate payment verification covers recovery, permission composition, and reset; extend client tests to verify the UI or SDK's response to those same outcomes.

Keep each parallel worker on its own simulator and address. Consume requests and wait for client commands to finish before resetting. Scenarios transform live state and do not roll back partial changes after a failure.

## Leave evidence for a human reviewer

Return:

- The contract snapshot, implementation commit, dependency lockfile, custom handlers, and scenario names.
- The exact verification commands, exit statuses, HTTP assertions, and captured test output.
- The actual local address and scenario used for that run; the address is diagnostic evidence, not a port to hard-code for the next run.
- Client files changed and the expected visible outcomes.
- Remaining assumptions and targeted tests against the real backend, including production authorization and payment semantics.

Keep the API inputs and setup consistent so you can repeat the tests. Review the agent’s code and test the integration against the real service too.

## Keep exploring

- [AI-assisted implementation](./ai-assisted-implementation.md) — give an agent a narrow handler-authoring task
- [Automated integration tests](./automated-integration-tests.md) — isolate workers and await setup/teardown
- [Validation boundaries](../manual/validation.md) — distinguish authoring types, runtime diagnostics, and behavioral assertions
- [Hybrid proxy](./hybrid-proxy.md) — deliberately select real service calls when that is what a test needs to exercise
