# Counterfact REPL Skill - Examples

This document provides concrete examples of how AI agents use the Counterfact Admin API through the `counterfact-repl` skill.

## Preconditions for all examples

Start Counterfact with `npx counterfact openapi.yaml --admin-api`, set
`admin-api: true` in `counterfact.yaml`, or use `startAdminApi: true` in the
programmatic API configuration. Admin API access is disabled by default. These examples
use the ungrouped API at port 3100. For a grouped runner, append its group
subdirectory to `/_counterfact/api` in every Admin API URL; also substitute the
actual port. The served-route `prefix` is independent of that Admin API base.

If `--admin-api-token` or `COUNTERFACT_ADMIN_API_TOKEN` is configured, send
`Authorization: Bearer <TOKEN_VALUE>` in every request, including health.
Missing/invalid tokens return 401. Without a token, middleware restricts
request IPs to loopback (403 otherwise); it does not guarantee a loopback-only
listener. A 404 can indicate a disabled Admin API or wrong group URL even
when the mock server is running.

JSON context updates can remove class prototype methods. An unseen path's
first update adds/replaces its context rather than merging; subsequent updates
compare against cached input, so a scalar equal to the cached value can leave
live route mutations intact. Prefer scenarios/context methods in the REPL
when preserving domain methods matters. Before confirming any setup or reset,
read back the affected contexts and test the routes that consume them.

## Example 1: Discovering and Inspecting State

**User:** "What data is currently in the pet store mock?"

**Agent Actions:**

```http
# 1. Verify server is running
GET http://localhost:3100/_counterfact/api/health
```

```json
{
  "status": "ok",
  "port": 3100,
  "basePath": "/",
  "prefix": "",
  "uptime": 456.78
}
```

```http
# 2. List all available contexts
GET http://localhost:3100/_counterfact/api/contexts
```

```json
{
  "success": true,
  "data": {
    "paths": ["/", "/pets"],
    "contexts": {
      "/": {},
      "/pets": {
        "pets": [
          { "id": 1, "name": "Fido", "status": "available" },
          { "id": 2, "name": "Whiskers", "status": "available" }
        ]
      }
    }
  }
}
```

```http
# 3. Get specific context details
GET http://localhost:3100/_counterfact/api/contexts/pets
```

**Agent Response:**

```
The pet store currently has 2 pets:

1. Fido (ID: 1) - Status: available
2. Whiskers (ID: 2) - Status: available

This data is stored in the /pets context.
```

---

## Example 2: Adding Test Data

**User:** "Add 3 more pets to the store: Rex (dog), Mittens (cat), and Goldie (fish)"

**Agent Actions:**

```http
# 1. Get current state
GET http://localhost:3100/_counterfact/api/contexts/pets
```

```json
{
  "success": true,
  "data": {
    "path": "/pets",
    "context": {
      "pets": [
        { "id": 1, "name": "Fido", "status": "available" },
        { "id": 2, "name": "Whiskers", "status": "available" }
      ]
    }
  }
}
```

```http
# 2. Update with new pets added
POST http://localhost:3100/_counterfact/api/contexts/pets
Content-Type: application/json

{
  "pets": [
    { "id": 1, "name": "Fido", "status": "available" },
    { "id": 2, "name": "Whiskers", "status": "available" },
    { "id": 3, "name": "Rex", "species": "dog", "status": "available" },
    { "id": 4, "name": "Mittens", "species": "cat", "status": "available" },
    { "id": 5, "name": "Goldie", "species": "fish", "status": "available" }
  ]
}
```

```json
{
  "success": true,
  "message": "Context updated for path: /pets",
  "data": {
    "path": "/pets",
    "context": {
      "pets": [...]
    }
  }
}
```

```http
# 3. Verify via API endpoint
GET http://localhost:3100/pets
```

**Agent Response:**

```
✓ Successfully added 3 new pets to the store:
  - Rex (dog)
  - Mittens (cat)
  - Goldie (fish)

The store now has 5 pets total. You can test this by making a GET request to /pets.
```

---

## Example 3: Simulating Service Failure

**User:** "I want to test how my UI handles when the pet service is down. Make it return errors."

**Agent Actions:**

```http
# 1. Set failure flag in context
POST http://localhost:3100/_counterfact/api/contexts/pets
Content-Type: application/json

{
  "pets": [
    { "id": 1, "name": "Fido", "status": "available" },
    { "id": 2, "name": "Whiskers", "status": "available" }
  ],
  "serviceAvailable": false,
  "errorMessage": "Service temporarily unavailable"
}
```

**Agent Response:**

````
I've set the pet service to simulate a failure. However, for this to work, your route handler needs to check the `serviceAvailable` flag.

Here's an example of how your route handler should be updated:

```typescript
// routes/pets.ts
export const GET: HTTP_GET = function ($) {
  if (!$.context.serviceAvailable) {
    return $.response.status(503).json({
      error: $.context.errorMessage || "Service unavailable"
    });
  }

  return $.response.status(200).json($.context.pets);
};
````

If your handler already checks this flag, requests to /pets will now return 503 errors.

To restore normal operation:

```
POST /_counterfact/api/contexts/pets
{ "serviceAvailable": true }
```

````

---

## Example 4: Switching Between Mock and Proxy

**User:** "Proxy the /users endpoint to the production API but keep /pets mocked"

**Agent Actions:**

```http
# 1. Check current proxy settings
GET http://localhost:3100/_counterfact/api/config/proxy
````

```json
{
  "success": true,
  "data": {
    "proxyUrl": "",
    "proxyPaths": []
  }
}
```

```http
# 2. Configure proxy
PATCH http://localhost:3100/_counterfact/api/config/proxy
Content-Type: application/json

{
  "proxyUrl": "https://api.production.com",
  "proxyPaths": [
    ["/users", true],
    ["/pets", false]
  ]
}
```

```json
{
  "success": true,
  "message": "Proxy configuration updated",
  "data": {
    "proxyUrl": "https://api.production.com",
    "proxyPaths": [
      ["/users", true],
      ["/pets", false]
    ]
  }
}
```

**Agent Response:**

```
✓ Proxy configuration updated!

Routing configuration:
- /users → PROXY to https://api.production.com/users (real API)
- /pets → MOCK (local mock data)

Now:
- Requests to http://localhost:3100/users and its descendants inherit proxy
  routing unless a more specific entry overrides it
- Requests to http://localhost:3100/pets will use your mock data

To revert /users back to mock mode:
```

PATCH /\_counterfact/api/config/proxy
{ "proxyPaths": [["/users", false]] }

```

```

---

## Example 5: Batch Test Data Setup

**User:** "Set up a complete test scenario with 3 users and 5 products"

**Agent Actions:**

```http
# 1. Create users context
POST http://localhost:3100/_counterfact/api/contexts/users
Content-Type: application/json

{
  "users": [
    {
      "id": 1,
      "username": "alice",
      "email": "alice@example.com",
      "role": "admin"
    },
    {
      "id": 2,
      "username": "bob",
      "email": "bob@example.com",
      "role": "user"
    },
    {
      "id": 3,
      "username": "charlie",
      "email": "charlie@example.com",
      "role": "user"
    }
  ]
}
```

```http
# 2. Create products context
POST http://localhost:3100/_counterfact/api/contexts/products
Content-Type: application/json

{
  "products": [
    {
      "id": 101,
      "name": "Laptop",
      "price": 999.99,
      "category": "electronics",
      "inStock": true
    },
    {
      "id": 102,
      "name": "Mouse",
      "price": 29.99,
      "category": "electronics",
      "inStock": true
    },
    {
      "id": 103,
      "name": "Desk Chair",
      "price": 199.99,
      "category": "furniture",
      "inStock": false
    },
    {
      "id": 104,
      "name": "Monitor",
      "price": 349.99,
      "category": "electronics",
      "inStock": true
    },
    {
      "id": 105,
      "name": "Keyboard",
      "price": 79.99,
      "category": "electronics",
      "inStock": true
    }
  ]
}
```

```http
# 3. Verify setup
GET http://localhost:3100/_counterfact/api/contexts
```

**Agent Response:**

```
✓ Test scenario created successfully!

Users (3):
1. alice (admin) - alice@example.com
2. bob (user) - bob@example.com
3. charlie (user) - charlie@example.com

Products (5):
1. Laptop - $999.99 (in stock)
2. Mouse - $29.99 (in stock)
3. Desk Chair - $199.99 (out of stock)
4. Monitor - $349.99 (in stock)
5. Keyboard - $79.99 (in stock)

You can now test:
- GET /users - Returns all users
- GET /users/1 - Returns alice
- GET /products - Returns all products
- GET /products/103 - Returns the out-of-stock chair
```

---

## Example 6: Testing Edge Cases

**User:** "I need to test pagination. Set up 50 users."

**Agent Actions:**

```javascript
// Agent generates 50 test users
const users = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1,
  username: `user${i + 1}`,
  email: `user${i + 1}@example.com`,
  role: i % 5 === 0 ? "admin" : "user",
  createdAt: new Date(2024, 0, i + 1).toISOString(),
}));
```

```http
POST http://localhost:3100/_counterfact/api/contexts/users
Content-Type: application/json

{
  "users": [...50 users...],
  "totalCount": 50,
  "pageSize": 10
}
```

**Agent Response:**

````
✓ Created 50 test users (IDs 1-50)

Users include:
- 10 admins (every 5th user)
- 40 regular users
- Sequential creation dates

Context also includes:
- totalCount: 50
- pageSize: 10

Your pagination endpoints can use these to return:
- Page 1: Users 1-10
- Page 2: Users 11-20
- etc.

Example route handler:
```typescript
export const GET: HTTP_GET = function ($) {
  const page = parseInt($.query.page) || 1;
  const size = $.context.pageSize || 10;
  const start = (page - 1) * size;
  const end = start + size;

  return $.response.status(200).json({
    users: $.context.users.slice(start, end),
    total: $.context.totalCount,
    page,
    pageSize: size
  });
};
````

````

---

## Example 7: Resetting State

**User:** "Reset everything back to empty"

**Agent Actions:**

```http
# 1. Get all contexts
GET http://localhost:3100/_counterfact/api/contexts
```

```http
# 2. Clear the listed arrays (a partial reset)
POST http://localhost:3100/_counterfact/api/contexts/users
Content-Type: application/json

{
  "users": []
}
```

```http
POST http://localhost:3100/_counterfact/api/contexts/products
Content-Type: application/json

{
  "products": []
}
```

```http
POST http://localhost:3100/_counterfact/api/contexts/pets
Content-Type: application/json

{
  "pets": []
}
```

**Agent Response:**

```
After reading back the contexts and testing the affected routes:
✓ The users, products and pets arrays are empty. Other properties and
contexts have not been reset.

- Users: 0
- Products: 0
- Pets: 0

Note: A server restart recreates in-memory contexts and can run startup
scenarios; it does not guarantee an empty initial state.
```

---

## Example 8: Debugging API Issues

**User:** "The /pets endpoint is returning weird data. What's in the context?"

**Agent Actions:**

```http
# 1. Check routes
GET http://localhost:3100/_counterfact/api/routes
```

```json
{
  "success": true,
  "data": {
    "routes": [
      {
        "path": "/pets",
        "methods": { "GET": true, "POST": true }
      },
      {
        "path": "/pets/{id}",
        "methods": { "GET": true, "PUT": true, "DELETE": true }
      }
    ]
  }
}
```

```http
# 2. Inspect context
GET http://localhost:3100/_counterfact/api/contexts/pets
```

```json
{
  "success": true,
  "data": {
    "path": "/pets",
    "context": {
      "pets": [{ "id": "1", "name": 123, "status": null }]
    }
  }
}
```

**Agent Response:**

````

Found the issue! The /pets context has incorrect data types:

Problems:

1. id is a string ("1") instead of number
2. name is a number (123) instead of string
3. status is null instead of a string

Corrected context:

```http
POST /_counterfact/api/contexts/pets
{
  "pets": [
    { "id": 1, "name": "Pet Name", "status": "available" }
  ]
}
```

The endpoint should now return properly typed data.

````

---

## Example 9: Integration Testing Workflow

**User:** "Help me test the complete user registration flow"

**Agent Actions:**

```http
# 1. Ensure users context is ready
GET http://localhost:3100/_counterfact/api/contexts/users
````

```http
# 2. Set up initial state
POST http://localhost:3100/_counterfact/api/contexts/users
Content-Type: application/json

{
  "users": [],
  "nextId": 1,
  "emailValidation": true
}
```

**Agent Response:**

````
✓ User registration test environment ready!

Initial state:
- Empty user list
- Auto-incrementing IDs starting at 1
- Email validation enabled

Test flow:
1. POST /users with new user data
2. Verify user appears in context
3. Test duplicate email handling
4. Test invalid email format

To verify:
```http
GET /_counterfact/api/contexts/users
````

After each test, check that your route handler properly:

- Increments nextId
- Adds user to users array
- Returns appropriate status codes

````

---

## Example 10: Working with Complex State

**User:** "Set up a shopping cart simulation with user sessions"

**Agent Actions:**

```http
POST http://localhost:3100/_counterfact/api/contexts/cart
Content-Type: application/json

{
  "sessions": {
    "session-abc-123": {
      "userId": 1,
      "items": [
        { "productId": 101, "quantity": 2, "price": 999.99 },
        { "productId": 102, "quantity": 1, "price": 29.99 }
      ],
      "subtotal": 2029.97,
      "createdAt": "2026-03-06T10:00:00Z"
    },
    "session-def-456": {
      "userId": 2,
      "items": [
        { "productId": 104, "quantity": 1, "price": 349.99 }
      ],
      "subtotal": 349.99,
      "createdAt": "2026-03-06T11:00:00Z"
    }
  },
  "abandonedCarts": ["session-xyz-789"]
}
````

**Agent Response:**

```
✓ Shopping cart simulation ready!

Active sessions: 2
- session-abc-123: User 1, 3 items, $2,029.97
- session-def-456: User 2, 1 item, $349.99

Abandoned carts: 1

Your route handlers can now:
- GET /cart/:sessionId - Retrieve cart by session
- POST /cart/:sessionId/items - Add items
- DELETE /cart/:sessionId/items/:productId - Remove items
- GET /cart/abandoned - List abandoned carts

Access via: $.context.sessions[sessionId]
```

---

## Tips for Effective Usage

### 1. Always Check Health First

```http
GET /_counterfact/api/health
```

Confirms access to the enabled Admin API for the selected group. The health
response's `prefix` is the served-route prefix, not its Admin API mount.

### 2. Inspect Before Modifying

```http
GET /_counterfact/api/contexts/path
```

See current state before making changes to avoid overwriting data.

### 3. Account for JSON Update Limitations

For a previously seen plain-object context, send properties you intend to
change and verify the result:

```json
{ "newProperty": "value" }
```

Omitted properties can remain after subsequent updates, but the first update
can replace the context. JSON updates adopt the posted prototype and can
remove class methods. Cached equal scalars can preserve intervening live
mutations. Use REPL context/scenario methods when these limitations matter.

### 4. Verify Changes

After updates, fetch context or test endpoint to confirm changes took effect.

### 5. Document State Shape

When setting up complex state, document the expected structure in comments.

### 6. Leverage Hierarchical Contexts

Use path hierarchy to organize related data:

- `/api` - API-wide settings
- `/api/users` - User-specific data
- `/api/products` - Product-specific data

### 7. Test Proxy Incrementally

Start with one path, verify it works, then expand to others.

### 8. Reset Between Tests

Clear state between test scenarios to avoid contamination:

```http
POST /_counterfact/api/contexts/path
{ "property": [] }
```
