# Route Builder

The `route()` function in the Counterfact REPL creates a fluent, immutable request builder backed by your OpenAPI document. It is an alternative to the lower-level `client` object — offering autocomplete for path parameters, built-in validation of required parameters, and inline OpenAPI documentation.

## Creating a builder

```js
const pet = route("/pet/{petId}");
```

At this point no request has been sent. `pet` is a `RouteBuilder` instance that you can inspect and configure before firing the request.

> **Tip:** Tab-complete works on the path argument. Press `Tab` after the opening `"` to cycle through known routes.

## Setting the HTTP method

```js
route("/pet/{petId}").method("get");
route("/pet").method("post");
```

Method names are case-insensitive.

## Setting parameters

Builders are **immutable** — every method returns a new `RouteBuilder` rather than mutating the original. Chain as many calls as you like.

### Path parameters

```js
route("/pet/{petId}").method("get").path({ petId: 42 });
```

### Query parameters

```js
route("/pet/findByStatus").method("get").query({ status: "available" });
```

### Request headers

```js
route("/pet").method("post").headers({ "x-api-key": "secret" });
```

Header names are matched case-insensitively when Counterfact checks required
OpenAPI header parameters.

### Cookies

```js
route("/account").method("get").cookies({ session: "abc 123" });
```

Cookie names and values supplied through `.cookies()` are percent-encoded and
merged with any existing `Cookie` header. A `Cookie` header also satisfies
required OpenAPI cookie parameters; the header name is matched
case-insensitively.

### Request body

Pass a string or a plain object. Objects are serialised to JSON automatically.

```js
route("/pet").method("post").body({ name: "Rex", photoUrls: [] });
```

Required Swagger/OpenAPI 2 `body` parameters must be supplied with `.body()`.
For OpenAPI 3, `.body()` satisfies a required `requestBody` when the operation
declares a non-form content type such as `application/json`.

### Form fields

```js
route("/sessions").method("post").form({ username: "patrick", remember: true });
```

Required Swagger/OpenAPI 2 `formData` fields must have matching keys in
`.form()`. For OpenAPI 3, `.form()` satisfies a required `requestBody` when its
content includes `application/x-www-form-urlencoded` or `multipart/form-data`.

Forms are URL-encoded when that type is declared, and by default when no form
type is declared. Counterfact sends text-only multipart data when multipart is
the sole declared form type. Binary and file parts are not supported.

Only one request entity is active at a time: calling `.body()` after `.form()`,
or `.form()` after `.body()`, clears the earlier entity. The last method wins.

## Sending the request

```js
await route("/pet/{petId}").method("get").path({ petId: 42 }).send();
```

Output is printed in the same format as `client.get()` — colorized request/response blocks with JSON highlighting:

```
----- REQUEST #1 -----
GET /pet/42 HTTP/1.1
Host: localhost
...

----- RESPONSE #1 -----
HTTP/1.1 200 OK
...

{ "id": 42, "name": "Rex", ... }
```

The REPL prints the complete outbound request body. For text-only multipart
forms, this includes every form field and the final multipart boundary.

If a required path, query, header, cookie, body, or form input is missing,
`send()` throws a descriptive error instead of making the request.

## Inspecting a builder

Evaluating a builder at the REPL prompt (without calling `send()`) prints a summary of its current state:

```
⬣> route("/pet/{petId}").method("get")
GET /pet/{petId}

Path:
  petId: [missing]

Ready: false
```

### `.ready()`

Returns `true` when the method is set and all required parameters have values.

```js
route("/pet/{petId}").method("get").path({ petId: 1 }).ready(); // true
route("/pet/{petId}").method("get").ready(); // false — petId missing
```

### `.missing()`

Returns an object describing which required parameters are still unset, or `undefined` when the builder is ready to send.

```js
route("/pet/{petId}").method("get").missing();
// { path: [{ name: "petId", type: "integer" }] }
```

The returned object can contain `path`, `query`, `header`, `cookie`, `body`, and
`formData` groups. OpenAPI 3 request bodies are reported in the `body` group as
`requestBody`.

### `.help()`

Writes the OpenAPI summary, description, parameter list, and documented
responses for the selected operation to the console. It does not return the
formatted help text.

```js
route("/pet/{petId}").method("get").help();
```

```
GET /pet/{petId}

Summary:
  Find pet by ID

Description:
  Returns a single pet

Path Parameters:
  petId (integer, required)
    Description: ID of pet to return

Responses:
  200
    Description: successful operation
  404
    Description: Pet not found
```

## Reusing builders

Because builders are immutable you can save a partially configured one and branch from it:

```js
const base = route("/pet/{petId}").path({ petId: 5 });

await base.method("get").send();
await base.method("delete").send();
```

## Comparison with `client`

| Feature                   | `client` | `route()` |
| ------------------------- | -------- | --------- |
| Simple one-liner          | ✅       | ✅        |
| Path tab-complete         | ✅       | ✅        |
| Reusable/composable       | ❌       | ✅        |
| Required-param validation | ❌       | ✅        |
| Inline OpenAPI docs       | ❌       | ✅        |

Use `client` for quick one-off requests. Use `route()` when you want to inspect, compose, or reuse a request configuration.

## See also

- [REPL](./repl.md)
- [Usage](../usage.md)
