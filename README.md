<div align="center" markdown="1">

<h1><img src="./counterfact.svg" alt="Counterfact" border=0></h1>

<br>

![MIT License](https://img.shields.io/badge/license-MIT-blue) [![Coverage Status](https://coveralls.io/repos/github/counterfact/api-simulator/badge.svg)](https://coveralls.io/github/pmcelhaney/counterfact) ![friction 0%](https://img.shields.io/badge/friction-0%25-brightgreen) ![Swagger 2.0](https://img.shields.io/badge/Swagger-2.0-85EA2D) ![OpenAPI 3.0-3.2](https://img.shields.io/badge/OpenAPI-3.x-6BA539)

</div>

<div align="center" markdown="1">
<h2>Mock servers work—until you need state, failures, or control mid-run.</h2>
</div

Static responses aren’t enough. There’s no shared state. You can’t inject failures. You can’t test real workflows.<br>
Mock servers make it easy to get started, but hard to keep going.<br>
Counterfact is an API simulator without those limits. 

Point it at an [OpenAPI](https://www.openapis.org) document and get a live, stateful API in seconds. 
Supports Swagger 2.0 and OpenAPI 3.0, 3.1, and 3.2.
- Type-safe TypeScript handlers for every endpoint  
- Hot reloading as you edit  
- Shared state across routes  
- **A built-in REPL to control behavior at runtime**  
- Optional proxying to real backends

Flexbile for humans. Stable for [AI agents](https://github.com/counterfact/api-simulator/blob/main/docs/patterns/ai-assisted-implementation.md).

You’re in control—without restarting.

For a *frontend developer* waiting on a backend,<br>
a *test engineer* who needs clean, reproducible state,<br>
or an *AI agent* that needs a stable API

Real enough to be useful. Fake enough to be usable.


## Try it now 

```sh
npx counterfact@latest https://petstore3.swagger.io/api/v3/openapi.json api
```

> Starts a local server with a live REPL to inspect and control API behavior  
> Requires Node ≥ 22.0.0

## Go deeper

- [Getting started](./docs/getting-started.md) – Detailed walkthrough with state, REPL, and proxy  
- [Patterns](./docs/patterns/index.md) – How Counterfact transforms your workflow  
- [Example repo](https://github.com/counterfact/example-petstore) – Using Counterfact to implement the Swagger Petstore  
- [How it compares](./docs/comparison.md) – json-server, WireMock, Prism, Microcks, MSW  
- [Usage](./docs/usage.md) – Explore features and how to use them  
- [Reference](./docs/reference.md) – `$` API, CLI flags, architecture  
- [FAQ](./docs/faq.md) – State, types, regeneration  

<div align="center" markdown="1">

[Changelog](./CHANGELOG.md) · [Contributing](./CONTRIBUTING.md)

</div>
