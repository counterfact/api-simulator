---
name: counterfact-repl
description: >
  Interact with Counterfact mock API server programmatically.
  Inspect and modify context state, configure proxy settings,
  test endpoints, and control mock behavior. Use when the user
  mentions "counterfact", "mock server", "REPL", testing APIs,
  or working with OpenAPI mocks.
applyTo:
  - "**/*.{yaml,yml,json}"
  - "**/routes/**/*.{ts,js}"
  - "**/*context.{ts,js}"
---

# Counterfact REPL Skill

## Purpose

This skill enables AI agents to interact with a running Counterfact mock server through its Admin API. Counterfact provides programmable API mocks based on OpenAPI specifications, with a REPL for runtime manipulation. This skill exposes those capabilities programmatically via HTTP endpoints.

## What is Counterfact?

Counterfact is a contract-driven mock API server that:

- Generates mock endpoints from OpenAPI specifications
- Provides a JavaScript REPL for runtime state manipulation
- Allows programmable behavior (not just static responses)
- Supports context objects for storing mock state
- Enables proxy mode to route requests to real APIs selectively

The REPL lets developers manipulate mock state in real-time using JavaScript. This skill exposes state inspection and JSON updates via HTTP API; it does
not evaluate arbitrary REPL code or invoke context methods.

## When to Use This Skill

Invoke this skill when the user:

- Mentions "counterfact", "mock server", "REPL", or "OpenAPI"
- Wants to test or develop against a mock API
- Needs to inspect or modify mock server state
- Wants to configure proxy vs. mock routing
- Needs to simulate API failures or edge cases
- Says things like:
  - "Add data to the mock"
  - "Change the mock state"
  - "Make the API return an error"
  - "Proxy this endpoint to the real server"
  - "What data is in the mock store?"
  - "Simulate a service failure"

## Detecting Counterfact

First inspect project scripts/configuration to discover the port, selected API
group, and whether the Admin API is enabled. It is opt-in: start with
`npx counterfact openapi.yaml --admin-api`, set `admin-api: true` in
`counterfact.yaml`, or use `startAdminApi: true` with the programmatic API.
Then check these indicators:

1. **Check the enabled Admin API health endpoint**:

   ```http
   GET http://localhost:3100/_counterfact/api/health
   ```

   This example assumes the default port and ungrouped API. A successful
   response confirms the Admin API is accessible; a 404 can mean it is disabled
   or you selected the wrong group prefix, even when the mock server is healthy.

2. **Look for package.json**:
   - Check if `counterfact` is in dependencies or devDependencies
   - Read scripts to find the port (e.g., `--port 3000`)

3. **Check for routes directory**:
   - Look for `routes/` or `api/routes/` directory
   - TypeScript/JavaScript files matching OpenAPI paths

4. **Check for OpenAPI spec**:
   - Files matching `*.yaml`, `openapi.yaml`, `swagger.yaml`
   - Look for `openapi:` or `swagger:` in content

5. **Try alternate ports**:
   - Port 3100 (default)
   - Port 3000 (common alternative)
   - Check environment variables or config files

## Admin API Endpoints

The Admin API base URL is `http://localhost:<port>/_counterfact/api` followed
by the selected runner's group subdirectory (for example `/pets` for group
`pets`). Every endpoint below uses the ungrouped base URL; substitute the
configured port and group subdirectory in every request. The served-route
`prefix` is separate from this Admin API prefix.

If an admin token is configured using `--admin-api-token` or
`COUNTERFACT_ADMIN_API_TOKEN`, add `Authorization: Bearer <TOKEN_VALUE>` to
every request, including health checks. A missing/invalid token returns 401.
Without a token, middleware checks the request IP and rejects nonloopback
requests with 403. Disabled Admin API endpoints normally return 404.

### Health Check

**Request:**

```http
GET /_counterfact/api/health
```

**Response:**

```json
{
  "status": "ok",
  "port": 3100,
  "uptime": 123.45,
  "basePath": "/path/to/routes",
  "prefix": ""
}
```

**Use when:** Checking Admin API access and getting server info. `prefix` in
the response is the served-route prefix (`config.prefix`), not the Admin API
mount path.

---

### List All Contexts

**Request:**

```http
GET /_counterfact/api/contexts
```

**Response:**

```json
{
  "success": true,
  "data": {
    "paths": ["/", "/pets", "/users"],
    "contexts": {
      "/": { "rootProperty": "value" },
      "/pets": { "pets": [...] },
      "/users": { "users": [...] }
    }
  }
}
```

**Use when:** Discovering what contexts exist, getting overview of all state.

---

### Get Specific Context

**Request:**

```http
GET /_counterfact/api/contexts/{path}
```

Example:

```http
GET /_counterfact/api/contexts/pets
```

**Response:**

```json
{
  "success": true,
  "data": {
    "path": "/pets",
    "context": {
      "pets": [
        { "id": 1, "name": "Fido" },
        { "id": 2, "name": "Whiskers" }
      ]
    }
  }
}
```

**Use when:** Inspecting state for a specific API path.

---

### Update Context

**Request:**

```http
POST /_counterfact/api/contexts/{path}
Content-Type: application/json

{
  "property": "newValue",
  "arrayProperty": [...]
}
```

Example:

```http
POST /_counterfact/api/contexts/pets
Content-Type: application/json

{
  "pets": [
    { "id": 1, "name": "Fido" },
    { "id": 2, "name": "Whiskers" },
    { "id": 3, "name": "Rex" }
  ]
}
```

**Response:**

```json
{
  "success": true,
  "message": "Context updated for path: /pets",
  "data": {
    "path": "/pets",
    "context": { "pets": [...] }
  }
}
```

**Use when:** Adding data, modifying state, simulating conditions.

**Important:** JSON updates do not preserve class prototype methods. The
registry adopts the posted object's prototype, so methods on class contexts
can be lost. Use scenario/context methods through the interactive REPL for
domain changes where method integrity matters. The first update to an unseen
registry path adds/replaces its context rather than merging. Later updates
compare values with the cached previous input, not current live state: posting
a scalar equal to that cache can leave an intervening route mutation intact.
Read back the context and test the affected endpoint after every update.

---

### Get Full Configuration

**Request:**

```http
GET /_counterfact/api/config
```

**Response:**

```json
{
  "success": true,
  "data": {
    "alwaysFakeOptionals": false,
    "basePath": "/path/to/routes",
    "buildCache": false,
    "generate": { "routes": true, "types": true },
    "openApiPath": "/path/to/openapi.yaml",
    "port": 3100,
    "proxyUrl": "",
    "prefix": "",
    "startRepl": true,
    "startServer": true,
    "watch": { "routes": true, "types": true },
    "proxyPaths": []
  }
}
```

**Use when:** Getting full server configuration.

---

### Get Proxy Configuration

**Request:**

```http
GET /_counterfact/api/config/proxy
```

**Response:**

```json
{
  "success": true,
  "data": {
    "proxyUrl": "https://api.example.com",
    "proxyPaths": [
      ["/api/users", true],
      ["/api/posts", false]
    ]
  }
}
```

**Use when:** Checking what paths are proxied vs. mocked.

---

### Update Proxy Configuration

**Request:**

```http
PATCH /_counterfact/api/config/proxy
Content-Type: application/json

{
  "proxyUrl": "https://api.example.com",
  "proxyPaths": [
    ["/api/users", true],
    ["/api/posts", false]
  ]
}
```

**Response:**

```json
{
  "success": true,
  "message": "Proxy configuration updated",
  "data": {
    "proxyUrl": "https://api.example.com",
    "proxyPaths": [
      ["/api/users", true],
      ["/api/posts", false]
    ]
  }
}
```

**Use when:** Switching between mock and real API, testing integration.

**Notes:**

- `proxyUrl` is the base URL to proxy to
- `proxyPaths` is an array of `[path, enabled]` tuples
- Path of `""` or `"/"` enables proxy globally
- Setting path `true` routes to real API, `false` uses mock
- Exact entries take precedence; otherwise the closest configured ancestor
  applies to descendants. Matching is case-sensitive.
- PATCH merges supplied proxy path entries; omitted entries remain configured.

---

### List All Routes

**Request:**

```http
GET /_counterfact/api/routes
```

**Response:**

```json
{
  "success": true,
  "data": {
    "routes": [
      {
        "path": "/pets",
        "methods": {
          "GET": true,
          "POST": true
        }
      },
      {
        "path": "/pets/{id}",
        "methods": {
          "GET": true,
          "PUT": true,
          "DELETE": true
        }
      }
    ]
  }
}
```

**Use when:** Discovering available endpoints, understanding API structure.

---

## Common Usage Patterns

### Pattern 1: Inspect Current State

**User request:** "What pets are in the store?"

**Agent workflow:**

```
1. GET /_counterfact/api/health
   → Confirm server running

2. GET /_counterfact/api/contexts/pets
   → Retrieve pets array

3. Present formatted list to user
```

**Example response:**

```
Currently in the pet store:
- ID 1: Fido
- ID 2: Whiskers
```

---

### Pattern 2: Add Test Data

**User request:** "Add a new pet named Rex with ID 3"

**Agent workflow:**

```
1. GET /_counterfact/api/contexts/pets
   → Get current pets

2. Append new pet to array

3. POST /_counterfact/api/contexts/pets
   Body: { "pets": [...existingPets, newPet] }
   → Update context

4. Verify by GETting /pets endpoint
   → Confirm change visible in API
```

---

### Pattern 3: Simulate Failure

**User request:** "Make the user service unavailable"

**Agent workflow:**

```
1. POST /_counterfact/api/contexts/users
   Body: { "serviceAvailable": false }
   → Set failure flag

2. Explain that route handlers should check this flag

3. Optionally: Test GET /users to verify error
```

**Note:** The route handler must be coded to check `context.serviceAvailable`. The skill sets the flag, but behavior depends on route implementation.

---

### Pattern 4: Switch to Proxy Mode

**User request:** "Route /orders to the real API"

**Agent workflow:**

```
1. GET /_counterfact/api/config/proxy
   → Check current proxy settings

2. PATCH /_counterfact/api/config/proxy
   Body: {
     "proxyUrl": "https://api.production.com",
     "proxyPaths": [["/orders", true]]
   }
   → Enable proxy for /orders

3. Confirm that /orders now hits real server
```

---

### Pattern 5: Batch Data Setup

**User request:** "Set up test data: 3 users and 5 products"

**Agent workflow:**

```
1. Create users array with test data

2. POST /_counterfact/api/contexts/users
   Body: { "users": [...testUsers] }

3. Create products array with test data

4. POST /_counterfact/api/contexts/products
   Body: { "products": [...testProducts] }

5. Read back each context and test the affected endpoints before confirming setup
```

---

## Error Handling

### Server Not Running

A connection failure can mean the server is absent or the port is wrong.
Inspect the process and configured port before restarting. Start with
`npx counterfact openapi.yaml --admin-api` when Admin API access is needed.
An HTTP error alone does not establish that the mock server is stopped.

### Admin API Access Errors

- **404:** Check `--admin-api`, YAML `admin-api`, or programmatic `startAdminApi`,
  plus the port and selected group
  subdirectory. An enabled server can still have a disabled Admin API.
- **401:** Send the configured bearer token; do not display its value.
- **403:** Without a token, access is restricted by request IP to loopback.

### Context Not Found

If context doesn't exist:

```
GET /_counterfact/api/contexts/nonexistent
→ Returns: { "path": "/nonexistent", "context": {...} }
```

Note: Contexts are hierarchical. If `/api/users` doesn't exist, it returns parent context.

### Invalid JSON

If request body is malformed:

```
← 400 Bad Request
{ "success": false, "error": "Request body must be a valid JSON object" }
```

### Server Error

If internal error occurs:

```
← 500 Internal Server Error
{
  "success": false,
  "error": "Error message",
  "stack": "..." // Only in development
}
```

---

## Advanced Techniques

### Hierarchical Contexts

Contexts are hierarchical. If you have:

```
/               → root context
/api            → api context
/api/users      → users context
```

Then `GET /_counterfact/api/contexts/api/users/123` returns the `/api/users` context (closest parent).

### Smart Diffing

After a path has been registered through `update`, later updates use cached
input diffing. For a plain JSON context, an omitted scalar can remain present:

```javascript
// Old context: { users: [...], count: 5 }

POST { users: [...newUsers] }
// Result: { users: [...newUsers], count: 5 }
//         count can remain present on a previously seen path
```

This is not a general preservation guarantee. First updates can replace
contexts; JSON changes can remove prototype methods; equal cached scalar
values can leave live mutations intact. Verify the result through both the
context endpoint and the route that consumes it.

### Testing Proxied Requests

After setting proxy:

```
1. PATCH /_counterfact/api/config/proxy
   Body: { "proxyPaths": [["/users", true]] }

2. Make request to http://localhost:3100/users
   → This now proxies to real server

3. Check response headers for proxy evidence
```

---

## Limitations

1. **In-memory state**: Changes reset on server restart
2. **No TypeScript validation**: Context can accept any JSON object
3. **Access controls**: Optional bearer-token authentication; without a token,
   only loopback request IPs are allowed
4. **No versioning**: API is v1, may evolve
5. **Context discovery**: Must know or discover paths, no automatic schema

---

## Security Considerations

⚠️ **Warning:** The Admin API provides full control over mock server state.

**Recommendations:**

- Only run Counterfact in development/testing environments
- Do not expose the Admin API to untrusted networks
- Configure a bearer token when exposing the Admin API beyond local development
- Be cautious with context updates from untrusted sources

**Current access controls:**

- The Admin API is disabled unless explicitly enabled
- Without a token, middleware restricts request IPs to loopback; this does not
  mean the server listener binds only to the loopback interface
- You can require a bearer token for all Admin API requests:
  - CLI flag: `--admin-api-token <TOKEN_VALUE>`
  - Environment variable: `COUNTERFACT_ADMIN_API_TOKEN=<TOKEN_VALUE>`
- When a token is configured, clients must send:
  - HTTP header: `Authorization: Bearer <TOKEN_VALUE>`

---

## Integration with OpenAPI

The skill works best when paired with OpenAPI understanding:

1. Read the OpenAPI spec to understand available paths
2. Map OpenAPI paths to context paths
3. Use OpenAPI schemas to validate context updates
4. Generate realistic test data based on OpenAPI examples

Example:

```
1. Read openapi.yaml
2. Find path /pets with schema: { id: number, name: string }
3. Generate test data: { id: 1, name: "Fido" }
4. POST /_counterfact/api/contexts/pets with test data
```

---

## Troubleshooting

**Issue:** Health check returns 404

**Solution:** Check that Admin API access is enabled and that the URL includes
the configured port and selected group subdirectory. A 404 does not by itself
mean the server is old or absent.

---

**Issue:** Context update doesn't affect API responses

**Solution:** Check route handler implementation. It must read from `$.context`.

Example route handler:

```typescript
export const GET: HTTP_GET = function ($) {
  return $.response.status(200).json($.context.pets);
};
```

---

**Issue:** Proxy not working

**Solution:**

- Verify proxyUrl is set: `GET /_counterfact/api/config/proxy`
- Check path is enabled: `proxyPaths` array
- Check the exact path and its ancestors (case-sensitive); a more specific
  `false` entry can override an ancestor enabled for proxying

---

## See Also

- [Counterfact Documentation](https://counterfact.dev)
- [Admin API Examples](./examples.md)
- [Counterfact GitHub](https://github.com/pmcelhaney/counterfact)
