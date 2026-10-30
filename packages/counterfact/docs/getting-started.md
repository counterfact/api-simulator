# Build the frontend. Don’t wait for the backend.

Counterfact turns an OpenAPI document into a useful local API in one command.
Use it when your frontend is ready but the backend is incomplete, unavailable,
unstable, or owned by another team.

OpenAPI, formerly Swagger, describes an API’s endpoints, parameters, and responses in YAML or JSON. Use your own spec or try the public Petstore URL below. See [how the pieces fit together](./manual/concepts.md).

## Prerequisite

Use Node.js 22 or newer and Counterfact 3 or newer for the examples below. Counterfact supports Swagger 2.0 and OpenAPI 3.0,
3.1, and 3.2.

## Run one command

Give Counterfact an OpenAPI document and an output directory:

```sh
npx counterfact@latest https://petstore3.swagger.io/api/v3/openapi.json api
```

Counterfact writes editable route files and generated TypeScript types to
`api/`, then starts a local server at `http://localhost:3100`.

## Make a browser request

Point your frontend at the local base URL. For the Petstore document above, a
minimal request looks like this:

```ts
const response = await fetch("http://localhost:3100/pet/1");
if (!response.ok) throw new Error(`Request failed: ${response.status}`);
const pet = await response.json();
console.log(pet);
```

A successful request that logs a JSON object confirms the local API is responding. Supported operations return schema-derived sample data before you edit a handler. The generated values can vary; a response might look like this:

```json
{
  "id": 1,
  "name": "string",
  "photoUrls": [],
  "status": "available"
}
```

The sample data matches the response schema. Edit the handler when you need
specific values or behavior.

## Know what was generated

Counterfact creates two directories:

```text
api/
├── routes/   # editable handlers, one path at a time
└── types/    # generated request and response contracts
```

Do not edit `types/`; regenerate them when the OpenAPI document changes. Edit
handlers under `routes/`. Counterfact hot-reloads route changes while the
server is running.

<span id="make-one-response-explicit-optional"></span>

## Customize a response

When a screen needs a specific case, replace the generated response in the
corresponding handler. Counterfact supplies `$`: `$.path` contains URL parameters and `$.response` builds the HTTP response. `Routes["/pet"]["/{petId}"]["GET"]` selects the generated contract for this operation:

```ts
// api/routes/pet/{petId}.ts
import type { Routes } from "../../types/index.js";

export const GET: Routes["/pet"]["/{petId}"]["GET"] = function ($) {
  return $.response.status(200).json({
    id: $.path.petId,
    name: "Fluffy",
    photoUrls: [],
    status: "available",
  });
};
```

Save the file, then repeat the browser request above—no server restart is needed. The logged pet should now have `name: "Fluffy"`. If you pasted the request into a console, use a fresh scope or reload the page before declaring the same variables again.

## Use a repeatable project

For a project or CI workflow, install Counterfact as a development dependency and commit the lockfile. [First 10 minutes](./first-10-minutes.md#install-in-a-project) walks through stopping this trial, installing Counterfact and using a pinned contract in a separate project, and adding state. Use [project installation](./patterns/lifecycle-setup.md) for automated workflows.

## Next steps

- [Try the guided coffee shop](./manual/guided-example.md) — learn by changing real handlers beside a working storefront; no document required.
- [First 10 minutes](./first-10-minutes.md) — create a pet, fetch it, and test an error response.
- [Find your workflow](./usage.md) — find a guide for what you’re working on.
- [Custom responses](./features/routes.md), [state](./features/state.md), [failures](manual/edge-cases.md), and [proxying](./features/proxy.md) — add capabilities only when the workflow needs them.
- [Without OpenAPI](./features/without-openapi.md) — write routes without an OpenAPI spec.
