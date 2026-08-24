# Build the frontend. Don’t wait for the backend.

Counterfact turns an OpenAPI document into a useful local API in one command.
Use it when your frontend is ready but the backend is incomplete, unavailable,
unstable, or owned by another team.

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
npm install --save-dev counterfact@2.16.3
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
  "status": "available"
}
```

The generated response is a useful contract-shaped starting point for frontend
work and exploration. It is not a substitute for the business behavior you
choose to model.

## Know what was generated

The output directory contains files you can own:

```text
api/
├── routes/   # editable handlers, one path at a time
└── types/    # generated request and response contracts
```

Do not edit `types/`; regenerate them when the OpenAPI document changes. Edit
handlers under `routes/`. Counterfact hot-reloads route changes while the
server is running.

## Make one response explicit (optional)

When a screen needs a specific case, replace the generated response in the
corresponding handler:

```ts
// api/routes/pet/{petId}.ts
import type { HTTP_GET } from "../../types/paths/pet/{petId}.types.js";

export const GET: HTTP_GET = ($) =>
  $.response[200].json({
    id: $.path.petId,
    name: "Fluffy",
    status: "available",
  });
```

Save the file and refresh the frontend—no server restart is needed.

## Next steps

- [First 10 minutes](./first-10-minutes.md) — add a small create/read workflow and one frontend-relevant failure.
- [Usage](./usage.md) — find guides by job: frontend, testing, advanced control, or troubleshooting.
- [Custom responses](./features/routes.md), [state](./features/state.md), [failures](./patterns/simulate-failures.md), and [proxying](./features/proxy.md) — add capabilities only when the workflow needs them.
- [Without OpenAPI](./features/without-openapi.md) — use the deeper alternative when no OpenAPI document exists.
