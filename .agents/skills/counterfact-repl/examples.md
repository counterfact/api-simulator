# Admin API control examples

Read the [control workflow](SKILL.md) first. Examples below use the ungrouped
Admin API at port 3100. Substitute the actual port/group and send the configured
bearer token on every request. Use the [endpoint reference](references/admin-api.md)
for response shapes.

Before a state mutation, inspect the context implementation and consuming
handlers. JSON examples assume compatible plain-object contexts with the named
fields and existing route behavior. Use existing context/scenario methods in the
interactive REPL for class-backed contexts. If that interface is unavailable,
report the limitation before changing state.

After every mutation, read back the affected context/configuration and exercise
the affected endpoint. Report only the state and behavior observed. Setting a
flag or posting a collection cannot implement missing handler behavior.

## Inspect the pet store

For “What data is currently in the pet store mock?”, confirm Admin API access,
discover contexts, and inspect the context used by the pet routes:

```http
GET http://localhost:3100/_counterfact/api/health
GET http://localhost:3100/_counterfact/api/contexts
GET http://localhost:3100/_counterfact/api/contexts/pets
```

Describe the returned records and owning context. A nested path can resolve to
its nearest parent context; do not assume every URL has a separate context.

## Add a pet

For “Add Rex with ID 3”, inspect the existing context before preparing an update.
If it is class-backed, use its existing creation method or scenario in the REPL.
For a compatible plain-object context, preserve existing records in the posted
array. For example, if Fido is the only existing pet:

```http
POST http://localhost:3100/_counterfact/api/contexts/pets
Content-Type: application/json

{
  "pets": [
    { "id": 1, "name": "Fido", "status": "available" },
    { "id": 3, "name": "Rex", "status": "available" }
  ]
}
```

Read back `/contexts/pets` and request the served `/pets` endpoint before
confirming Rex is visible. Adapt the body to the actual contract and state.

## Simulate a failure

For “Make the pet service return errors”, first confirm the handler already
checks `serviceAvailable`. When the context supports this JSON update:

```http
POST http://localhost:3100/_counterfact/api/contexts/pets
Content-Type: application/json

{ "serviceAvailable": false }
```

Read back the context and request `/pets`; confirm the actual error status/body.
If the handler lacks failure behavior, explain the needed implementation change.
For an existing flag, restore it through the same appropriate interface and
verify recovery. Cached-input diffing means a repeated JSON scalar is not a
reliable general-purpose setter after intervening route mutations; use the
project's context/scenario method when that matters.

## Switch between mock and proxy

For “Proxy /users but keep /pets mocked”, inspect existing routing first:

```http
GET http://localhost:3100/_counterfact/api/config/proxy
```

Then update the intended entries using the upstream URL supplied by the user or
project configuration:

```http
PATCH http://localhost:3100/_counterfact/api/config/proxy
Content-Type: application/json

{
  "proxyUrl": "https://api.example.com",
  "proxyPaths": [["/users", true], ["/pets", false]]
}
```

PATCH merges entries; omitted entries remain. Exact entries win, otherwise the
closest configured ancestor applies, case-sensitively. A more specific `false`
can keep a descendant mocked. Read back the proxy configuration and exercise
both served endpoints before reporting the routing result.

To restore `/users` to mock mode, PATCH `{"proxyPaths":[["/users",false]]}` and
verify the response again.

## Set up users and products

For “Set up three users and five products”, discover the relevant contexts and
inspect their creation methods and required relationships. Prefer named setup
scenarios when available, preserving unrelated records and earlier scenarios.
For plain-object JSON setup, construct realistic records matching the project's
actual state shape and preserve fields the update should retain.

Read back both contexts and test the served user/product endpoints. A collection
visible in the Admin API establishes stored state; it does not establish that a
route returns that collection or supports individual-record lookup.

## Exercise pagination

For “Set up 50 users to test pagination”, check how the handler obtains its page
and size inputs, collection, and total. Seed enough distinct records through the
appropriate interface to cross a page boundary. Change `totalCount` or `pageSize`
only if the existing handler uses those fields.

Request at least two pages using the actual contract's query parameters. Check
record membership, page boundaries, and reported totals. Move pagination rules
into context methods when implementing them; keep handlers focused on inputs
and response mapping.

## Clear selected collections

For “Empty the users, products, and pets collections”, prefer named domain
methods or explicit contraction scenarios. For compatible plain-object contexts:

```http
POST http://localhost:3100/_counterfact/api/contexts/users
Content-Type: application/json

{ "users": [] }
```

Apply the analogous update to products and pets, then read back each context and
test the affected endpoints. Describe this as clearing those collections. Other
properties, counters, relationships, and contexts have not necessarily reset.
Restarting recreates contexts and can rerun startup scenarios; it does not
promise an empty world.

## Diagnose unexpected data

For “/pets returns incorrect data”, inspect the route catalog, consuming handler,
context, and OpenAPI response schema. Compare the observed values against that
schema before changing them. An `id` string or a `null` status is a defect only
when the contract or domain rules exclude it.

When authorized to repair state, use the appropriate mutation interface and
verify both readback and the served response. Keep observations separate from a
tentative explanation of how the bad state arose.

## Prepare registration tests

For “Help test user registration”, inspect the current creation/validation flow
and the fields it actually reads. Use a named scenario or context method for
setup when available. Preserve unrelated accounts; an explicitly empty-user
scenario may contract that collection when requested.

Exercise successful registration, duplicate-email handling, and invalid input as
the real contract supports them. Verify returned identifiers and subsequent
reads. Posting fields named `nextId` or `emailValidation` alone does not prove
incrementing IDs or validation exists.

## Prepare a cart workflow

For “Set up a shopping cart with sessions”, inspect session/cart methods and
relationships to users and products. Seed consistent records through existing
methods or scenarios. For a plain JSON context, use its documented structure;
keep derived totals consistent with items and quantities.

Read back the cart context and exercise the supported cart endpoints. Verify an
item update changes the observable cart as intended. Do not claim that posting
session data created handlers for reading, modifying, or abandoning carts.
