# Catch a contract change with TypeScript

When your API spec changes, regenerate the handler types and run `tsc` to find code that needs updating. Your editor can also show type errors. The server and hot reload do not run a full project typecheck.

## Generate a small typed operation

In a project with `"type": "module"`, install exact versions and commit the lockfile:

```sh
npm install --save-dev --save-exact counterfact typescript@6.0.3
```

Save `status.yaml`:

```yaml
openapi: 3.0.3
info: { title: Status API, version: 1.0.0 }
paths:
  /status:
    get:
      responses:
        "200":
          description: Service status
          content:
            application/json:
              schema:
                type: object
                required: [status]
                properties:
                  status: { type: string, enum: [ready] }
```

Generate, then replace the editable route:

```sh
npx counterfact status.yaml api --generate --no-update-check
```

```ts
// api/routes/status.ts
import type { HTTP_GET } from "../types/paths/status.types.js";
export const GET: HTTP_GET = function ($) {
  return $.response.status(200).json({ status: "ready" });
};
```

Save `tsconfig.counterfact.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["api/**/*.ts"]
}
```

Run `npx tsc --project tsconfig.counterfact.json`. It should exit successfully.

## Change the response contract

In the response schema, replace `required: [status]` with `required: [status, message]` and add `message: { type: string }` under `properties`. Regenerate and check:

```sh
npx counterfact status.yaml api --generate --no-update-check
npx tsc --project tsconfig.counterfact.json
```

The edited handler stays intact while its generated type changes. TypeScript should now exit nonzero with a diagnostic identifying the missing `message` property in the JSON response. Exact diagnostic wording depends on the compiler version.

Update the handler:

```ts
export const GET: HTTP_GET = function ($) {
  return $.response.status(200).json({
    status: "ready",
    message: "Accepting requests",
  });
};
```

Run the same typecheck again; it should pass. In CI, run generation and this explicit check with pinned dependencies before the client tests. Commit the specification and your changes together; follow your project’s convention for committing generated types.

## Understand the boundary

This demonstrates a structural authoring check for typed, included files. It does not prove every use of the API is correct: unchecked JavaScript, `any`, `$.x`, incomplete schemas, and unmodeled behavior can escape it. Runtime [validation](../manual/validation.md) checks a different, limited set of traffic properties. Keep HTTP assertions and targeted real-backend tests alongside the typecheck; Counterfact provides earlier local feedback rather than replacing a gateway.

When checking responses, make advisory header errors fail your HTTP test:

```js
const response = await fetch(`${baseUrl}/status`);
const body = await response.text();
assert.equal(response.status, 200, body);
assert.equal(response.headers.get("response-type-error"), null);
```

Here `assert` is `node:assert/strict` and `baseUrl` is the running simulator's address. This checks the response status and supported header diagnostics; it is not a general response-body schema check.
