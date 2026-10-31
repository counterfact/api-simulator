# Admin API endpoint reference

Read the [control workflow](../SKILL.md) before mutations. JSON update examples
assume a compatible plain-object context.

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

The returned `data.path` is the requested path. The context can come from a
parent when that path is not registered; use the path inventory from
`GET /_counterfact/api/contexts` to identify the exact registered owner.

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

Target an exact registered path from the context inventory unless creating an
override is intentional. A POST to an unregistered descendant creates a context
at that exact path; it does not update the parent that a GET there can return.
With only `/` registered, GET `/contexts/users` reads root state, while POST
`/contexts/users` creates `/users` and leaves the root unchanged. These paths are
relative to the configured Admin API base. POST `/contexts/` returns 404; change
root state through existing REPL/context methods.

**Before any context mutation:** inspect the context implementation and the
routes that consume it. A JSON readback cannot tell you whether a class has
prototype methods. Use existing context/scenario methods through the interactive
REPL for class-backed contexts or domain operations; this HTTP interface cannot
invoke those methods. If terminal access is unavailable, report that limitation
instead of substituting a JSON update. The JSON mutation examples below assume
plain-object contexts whose routes read the posted fields directly.

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
