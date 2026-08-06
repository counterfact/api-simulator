# What if I don't have an OpenAPI document?

## Running the server

If you don't have an [OpenAPI document](https://swagger.io/specification/), you can still use Counterfact. You won't have the benefit of code generation and autocomplete in your IDE, but you can still use the API to write JavaScript code that is terse and intuitive.

If you run Counterfact without any arguments, it will run in "OpenAPI-free" mode. (Technically, under the covers, it uses an empty OpenAPI document.)

```sh
npx counterfact@latest
```

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

```js
//{greeting}/{subject}.js
export function GET($) {
    return `${$.path.subject} says ${$.path.greeting}!`;
}
```

For more information on the `$` object, see the [reference guide](../reference.md).

## Now that you know how to work without an OpenAPI doc, here's why you should have one anyway

OpenAPI is the de-facto standard for documenting REST APIs. Counterfact is just one of [hundreds of tools](https://openapi.tools/) that use it. And if you pass Counterfact an OpenAPI doc, it will save you a lot of time by automatically generating default type-safe implementations of each API, with powerful context-sensitive autocomplete when you want to make changes.

Not many people love writing documentation. Fewer people still love working on APIs that are not documented. Counterfact makes documentation useful, with immediate ROI, so that maintaining the docs is just as rewarding as writing code.

## See also

- [Getting started](../getting-started.md) — start with an OpenAPI spec for type-safe, auto-generated routes
- [Usage](../usage.md) — full documentation for routes, context, REPL, and more
- [FAQ](../faq.md) — common questions about state, types, and regeneration
