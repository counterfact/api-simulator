# Admin API troubleshooting and advanced behavior

Read the [control workflow](../SKILL.md) before mutations.

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
import type { Routes } from "../types/index.js";

export const GET: Routes["/pets"]["GET"] = function ($) {
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
