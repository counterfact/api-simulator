# What if I don't have an OpenAPI document?

## Running the server

If you don't have an [OpenAPI document](https://swagger.io/specification/), you can still use Counterfact. You won't have the benefit of code generation and autocomplete in your IDE, but you can still use the API to write JavaScript code that is terse and intuitive.

Pass `_` in place of an OpenAPI path to start without a specification. Counterfact uses an empty OpenAPI document internally:

```sh
npx counterfact@latest _
```

With no arguments and no config file, Counterfact opens the [first-run intro](../api/cli.md#first-run-intro) instead. In a noninteractive environment, that invocation prints guidance and exits without starting a server.

If you want to specify the path where code is generated, enter "\_" in place of the path or URL to the OpenAPI document. For example, to put the code in an `api` directory under the working directory:

```sh
npx counterfact@latest _ api
```

## Creating routes

In the file where the code is generated, you should find a directory -- initially empty -- called `routes`. Here you can start adding mock APIs by adding JS or TS files. For example, to mock an API that responds to `GET /hello/world`, with "World says hello!" you would create `routes/hello/world.js` that looks like this.

```js
// hello/world.js
export function GET() {
  return "World says hello!";
}
```

If part of the path is variable, name the file or directory where the variable part is `{variableName}`. Here's a more advanced version of "hello world" where both the greeting and the subject are variable.

Counterfact passes a request object named `$` to the handler. Its `path` member contains the variables from the file path:

```js
//{greeting}/{subject}.js
export function GET($) {
  return `${$.path.subject} says ${$.path.greeting}!`;
}
```

For more information on the `$` object, see the [reference guide](../api.md).

<span id="now-that-you-know-how-to-work-without-an-openapi-doc-heres-why-you-should-have-one-anyway"></span>

## What an OpenAPI spec adds

Give Counterfact an OpenAPI spec and it generates starter handlers and TypeScript types for your API. Your editor can then suggest the parameters, status codes, and response shapes each handler accepts.

Not many people love writing documentation. Fewer people still love working on APIs that are not documented. With Counterfact, that documentation also generates your mock API and TypeScript types.

## See also

- [Getting started](../getting-started.md) — start with an OpenAPI spec for type-safe, auto-generated routes
- [Find your workflow](../usage.md) — full documentation for routes, context, REPL, and more
- [FAQ](../faq.md) — common questions about state, types, and regeneration
