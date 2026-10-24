# Build the frontend. Don’t wait for the backend.

Counterfact turns an OpenAPI document into a useful local API in one command.
Use it when your frontend is ready but the backend is incomplete, unavailable,
unstable, or owned by another team.

OpenAPI, formerly Swagger, describes an API’s endpoints, parameters, and responses in YAML or JSON. Use your own spec or try the public Petstore URL below. See [how the pieces fit together](./manual/concepts.md).

## Prerequisite

Use Node.js 22 or newer. Counterfact supports Swagger 2.0 and OpenAPI 3.0,
3.1, and 3.2.

## Run one command

Give Counterfact an OpenAPI document and an output directory:

```sh
npx counterfact@latest https://petstore3.swagger.io/api/v3/openapi.json api
```

Counterfact writes editable route files and generated TypeScript types to
`api/`, then starts a local server at `http://localhost:3100`.

For a project or CI workflow, install a pinned version and commit the lockfile:

```sh
npm install --save-dev --save-exact counterfact
npx counterfact ./openapi.yaml api
```

## Make a browser request

Point your frontend at the local base URL. For the Petstore document above, a
minimal request looks like this:

```ts
const response = await fetch("http://localhost:3100/pet/1");
const pet = await response.json();
```

Supported operations return schema-derived sample data immediately—before you
edit a handler. A response might look like this:

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
corresponding handler. Counterfact supplies `$`: `$.path` contains URL parameters and `$.response` builds the HTTP response. The imported `HTTP_GET` type comes from the generated contract:

```ts
// api/routes/pet/{petId}.ts
import type { HTTP_GET } from "../../types/paths/pet/{petId}.types.js";

export const GET: HTTP_GET = function ($) {
  return $.response.status(200).json({
    id: $.path.petId,
    name: "Fluffy",
    photoUrls: [],
    status: "available",
  });
};
```

Save the file and refresh the frontend—no server restart is needed.

## Next steps

- [Try the guided coffee shop](./manual/guided-example.md) — learn by changing real handlers beside a working storefront; no document required.
- [First 10 minutes](./first-10-minutes.md) — create a pet, fetch it, and test an error response.
- [Find your workflow](./usage.md) — find a guide for what you’re working on.
- [Custom responses](./features/routes.md), [state](./features/state.md), [failures](manual/edge-cases.md), and [proxying](./features/proxy.md) — add capabilities only when the workflow needs them.
- [Without OpenAPI](./features/without-openapi.md) — write routes without an OpenAPI spec.
