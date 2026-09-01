# Counterfact with React and Vite

This runnable example builds a React profile screen against an API generated
from `openapi.yaml`. The checked-in Counterfact handler supplies an explicit
frontend-ready response while preserving the generated request and response
types.

## Run it in a browser

Clone this repository, then enter the example and install its dependencies:

```sh
git clone https://github.com/counterfact/api-simulator.git
cd api-simulator/examples/react-vite
npm ci
```

In one terminal, start Counterfact on port 4310:

```sh
npm run api
```

In a second terminal, start Vite on port 4309:

```sh
npm run dev
```

Open [http://127.0.0.1:4309](http://127.0.0.1:4309). The page displays the Ada
Lovelace profile returned by Counterfact at `http://127.0.0.1:4310`. Press
<kbd>Ctrl</kbd>+<kbd>C</kbd> in each terminal when you are done.

## Verify it automatically

```sh
npm run verify
```

`verify` regenerates the API contract, type-checks the handler and frontend,
builds the Vite application, then starts Counterfact and checks its API
response over real HTTP. It does not open or prove the browser client.

For the packaged guide and the repository-hosted source, see [React and
Vite](../../packages/counterfact/docs/examples/react-vite.md).

Passing this example does not prove production authorization, side effects,
performance, or business behavior.
