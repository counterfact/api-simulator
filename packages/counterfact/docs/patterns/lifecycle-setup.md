# Install Counterfact for automated workflows

The examples in this manual use Counterfact 3 or newer, including `response.status(...)` and generated handler types such as `HTTP_GET`. Use Node.js 22 or newer. Install Counterfact in the project that owns the contract, custom handlers, and tests:

<span id="run-examples-from-the-current-source"></span>

```sh
npm init -y
npm install --save-dev --save-exact counterfact@latest
```

For an existing npm project, skip `npm init -y`. Commit `package.json` and the lockfile so teammates and CI use the same version; use `npm ci` to reproduce that installation. Keep each recipe's files in this project directory.

Use `npx --no-install counterfact` for generation commands so the CLI comes from the project's installed dependency.

## Check the lifecycle API

Save this as `check-lifecycle.mjs`:

```js
import assert from "node:assert/strict";
import { counterfact } from "counterfact";

const api = await counterfact({ basePath: "api", port: 0 });
assert.equal(typeof api.reset, "function");
assert.equal(typeof api.scenario, "function");
const { stop } = await api.start();
try {
  assert.ok(api.status().address);
  await api.reset();
  console.log("Lifecycle API ready");
} finally {
  await stop();
}
```

Run `node check-lifecycle.mjs`. The operating system chooses a free port for this check, and the script awaits shutdown before exiting.

Continue with [payment retry](./payment-retry.md), [automated integration tests](./automated-integration-tests.md), or [AI-assisted workflows](./agentic-sandbox.md).
