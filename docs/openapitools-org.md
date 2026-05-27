# OpenAPITools.org

## Overview

OpenAPITools.org is a home for tools that help teams work with OpenAPI specs.
Counterfact fits that workflow by turning an OpenAPI document into a live,
stateful API simulator in seconds.

## Features

- Generates type-safe TypeScript route handlers from your spec
- Serves schema-valid responses out of the box
- Supports shared in-memory state across routes
- Reloads changes instantly without restarting
- Includes a live REPL for runtime inspection and control

## Usage

Run Counterfact with an OpenAPI document to generate and start a server:

```sh
npx counterfact@latest https://petstore3.swagger.io/api/v3/openapi.json api
```

Edit the generated route files to add custom logic, use `_.context.ts` to share
state, and rely on the REPL to inspect or modify the running server as you work.
