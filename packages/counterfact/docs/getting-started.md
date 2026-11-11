# Counterfact fundamentals

Generate an API, try it in your browser, and give it behavior and shared state.
This walkthrough uses a small counter so you can see each change take effect.
You need Node.js 22.22 or newer and a TypeScript editor such as VS Code.

## 1. Generate a server from OpenAPI

OpenAPI, formerly Swagger, describes an API's paths, inputs, and responses.
Create a new directory for this exercise, then save the following as `openapi.yaml` inside it:

```yaml
openapi: 3.0.3
info:
  title: Counter API
  version: 1.0.0
paths:
  /count:
    get:
      responses:
        "200":
          description: The current count
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Count"
        "500":
          description: Something went wrong
          content:
            application/json:
              schema:
                type: object
                required: [message]
                properties:
                  message:
                    type: string
  /increment:
    post:
      responses:
        "200":
          description: The count after incrementing
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Count"
components:
  schemas:
    Count:
      type: object
      required: [count]
      properties:
        count:
          type: integer
          minimum: 0
          maximum: 100
```

Open a terminal in that directory and run:

```sh
npx counterfact@latest ./openapi.yaml api
```

Counterfact writes editable route files and generated TypeScript types to
`api/`, then starts a local server at `http://localhost:3100`.

Keep it running throughout this walkthrough.
Use your editor to change files and your browser to send requests.

Have your own spec? The same command accepts a local file or URL.
For this exercise, use the counter spec so the paths and response types match.

## 2. Try the server in Swagger UI

Open `http://localhost:3100/counterfact/swagger/`, or follow the Swagger UI link
printed in your terminal if Counterfact selected a different port.
Swagger UI is a browser interface for exploring your API and sending requests.

Expand `GET /count`, click **Try it out**, then **Execute**.
Under **Server response**, you should see status `200` and a JSON body such as:

```json
{ "count": 42 }
```

The count can vary because the generated handler returns random data that
matches the spec.
You already have a working API without writing a handler yourself.

## 3. Find the route handlers

Open the generated `api/routes/count.ts` in your editor.
A route file follows the URL path, and its exports name the HTTP methods it handles:

```text
api/
  routes/
    count.ts       # GET /count
    increment.ts   # POST /increment
    _.context.ts
  types/           # generated TypeScript contracts
```

The `GET` handler in `count.ts` looks like this:

```ts
import type { Routes } from "../types/index.js";

type Route = Routes["/count"];

export const GET: Route["GET"] = async ($) => {
  return $.response.status(200).random();
};
```

`Routes["/count"]["GET"]` gives this function the types for `GET /count`.
Edit files under `routes/`; Counterfact reloads them when you save.
The files under `types/` come from OpenAPI and are replaced during regeneration.

## 4. Simulate an error

In `count.ts`, change just `200` to `500`:

```ts
return $.response.status(500).random();
```

Save the file and execute `GET /count` again in Swagger UI.
The server now returns status `500` with a generated error body containing a
`message` field.
No restart is needed.
The spec declares this error response, so TypeScript accepts the new status.

Change `500` back to `200` and save before continuing.

## 5. Meet the `$` object

Counterfact passes an object named `$` to each handler.
It contains the request data and helpers for building a response.
The name is an ordinary function parameter, so keep the `$` when calling its helpers.

You've already used `$.response`: `.status(200)` selects the response status,
and `.random()` builds a body from that response's schema.
Other properties include `$.path`, `$.query`, `$.headers`, and `$.body` for request
inputs, and `$.context` for shared state.
Type `$.` in your editor to see the available properties.

## 6. Return a specific response

Replace `.random()` with `.json({ count: 0 })`:

```ts
export const GET: Routes["/count"]["GET"] = function ($) {
  return $.response.status(200).json({ count: 0 });
};
```

Keep the generated import at the top of the file.
Save and execute `GET /count` again: it now returns `{ "count": 0 }` every time.

TypeScript checks the JSON body against the selected response's generated type.
Try changing `count: 0` to `count: "zero"` in your editor: it reports that a string
cannot be used where a number is required.
Restore `count: 0` before continuing.
This is a TypeScript check, not a runtime check of every response body or every
OpenAPI constraint such as minimum and maximum values.

## 7. Remember the count with `$.context`

A local variable inside a handler starts over on every request.
Use `$.context` when you want later requests to see the same state.

First, open the generated `api/routes/_.context.ts` and add `count = 0;` inside
its `Context` class, leaving its existing constructor in place.
This declares a numeric field so TypeScript knows about it.
We'll return to this file in step 10.

Change the `GET` handler to increment and return that field:

```ts
export const GET: Routes["/count"]["GET"] = function ($) {
  $.context.count += 1;
  return $.response.status(200).json({ count: $.context.count });
};
```

Save and execute `GET /count` a few times.
Starting from a fresh context, the responses are `{ "count": 1 }`, then
`{ "count": 2 }`, then `{ "count": 3 }`.
The same object stays in memory between requests.
This temporary GET mutation makes state easy to see; next we'll move the
increment into a POST handler.

## 8. Share the context with another route

Change `GET /count` to read without incrementing:

```ts
export const GET: Routes["/count"]["GET"] = function ($) {
  return $.response.status(200).json({ count: $.context.count });
};
```

Then replace the `POST` handler in `api/routes/increment.ts` with:

```ts
import type { Routes } from "../types/index.js";

export const POST: Routes["/increment"]["POST"] = function ($) {
  $.context.count += 1;
  return $.response.status(200).json({ count: $.context.count });
};
```

Save both files.
In Swagger UI, execute `POST /increment`, then `GET /count`.
Both responses show the same count.
Executing `GET /count` again leaves it unchanged; executing `POST /increment`
increases it by one.
Both routes use the same `$.context` object, and saving route edits preserves
its current state.

## 9. Change the context in the REPL

Return to the terminal running Counterfact.
The REPL is a JavaScript prompt connected to your live API.
At its `⬣>` prompt, enter:

```js
context.count = 20;
```

Execute `GET /count` in Swagger UI: it returns `{ "count": 20 }`.
Execute `POST /increment`: it returns `{ "count": 21 }`.
The REPL's `context` is the same object your handlers receive as `$.context`.

You can read it or reset the count without changing a file:

```js
context.count;
context.count = 0;
```

These values live in memory.
Stopping the process and starting a new one creates fresh state.

## 10. Define the context in `_.context.ts`

The `_.context.ts` file defines the class Counterfact uses to create your shared
context object.
For this counter, the complete file can be as small as:

```ts
// api/routes/_.context.ts
export class Context {
  count = 0;
}
```

The initializer supplies the starting value for a new context.
It does not run again on every request.
Routes use the context from their directory, or the nearest parent directory
that has a `_.context.ts` file.
Here, both route files sit beside the root context, so both receive that object.

As your simulation grows, add properties and methods to this class to express
the behavior your frontend needs.
Those properties and methods are also available through `context` in the REPL.

## Explore further

You now have the fundamentals: generate a server, send requests, edit typed
handlers, and share state between routes and the REPL.
Use the REPL to explore further as you need more behavior:

- Enter `.help` to discover commands, or use the [REPL guide](./features/repl.md).
- [Build requests in the REPL](./features/route-builder.md) instead of switching to Swagger UI.
- [Apply scenarios](./patterns/scenario-scripts.md) to set up reusable states.
- Explore [failure modes](./manual/edge-cases.md), [nested contexts](./manual/nested-contexts.md), or [proxying](./features/proxy.md).
- [Install in a project](./patterns/lifecycle-setup.md) for a repeatable setup with a lockfile.

The [user manual](./manual.md) and [API reference](./api.md) cover the advanced details.
