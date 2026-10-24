# Install Counterfact for automated workflows

Use Node.js 22 or newer. Install Counterfact in the project that owns the contract, custom handlers, and tests:

```sh
npm init -y
npm install --save-dev --save-exact counterfact
```

For an existing npm project, skip `npm init -y`. Commit `package.json` and the lockfile so teammates and CI use the same version; use `npm ci` to reproduce that installation. Keep each recipe's files in this project directory.

Use `npx --no-install counterfact` for generation commands so the CLI comes from the project's installed dependency.

## Run examples from the current source

The current manual uses APIs from `main`, including callable `response.status(...)`. The published `counterfact@2.17.0` package does not provide that response API. To run these examples before the corresponding release, use this pinned source checkout with Node.js 24 and Corepack available:

```sh
git clone https://github.com/counterfact/api-simulator.git counterfact-source
cd counterfact-source
git checkout d1531ee7033f8861f7ef11cf9beccfca0ca60da9
corepack yarn install --immutable
corepack yarn build
mkdir counterfact-exercise
cd counterfact-exercise
```

Keep the exercise inside this checkout: `import { counterfact } from "counterfact"` resolves the built workspace package from the parent repository. Use `npx --no-install counterfact` for CLI commands here so they run that same build. The checkout pins the implementation; it does not install or change the globally published package. Keep exercise files in this directory and stop any earlier trial server before starting another on the same port.

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
