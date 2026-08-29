# Counterfact with React and Vite

This verified example builds a React profile screen against an API generated
from `openapi.yaml`. The checked-in Counterfact handler supplies one explicit
frontend-ready response while preserving the generated request and response
types.

```sh
npm ci
npm run verify
```

`verify` regenerates the API contract, type-checks the handler and frontend,
builds the Vite application, then starts Counterfact and asserts the response
over real HTTP.

For the guided workflow, see [React and Vite](../../packages/counterfact/docs/patterns/react-vite.md).

Passing this example does not prove production authorization, side effects,
performance, or business behavior.
