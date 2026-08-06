# `src/repl/` — Interactive REPL

This directory contains the interactive Read-Eval-Print Loop (REPL) that lets developers inspect and manipulate a running Counterfact server from the terminal — without touching any files.

## Files

| File | Description |
|---|---|
| `repl.ts` | Starts a Node.js REPL session pre-loaded with the context registry and custom dot-commands (`.proxy`, `.help`, etc.) |
| `RawHttpClient.ts` | Thin HTTP client available inside the REPL as `client`; formats JSON responses with syntax highlighting |
| `route-builder.ts` | Fluent, immutable request builder exposed as `route()` in the REPL; supports OpenAPI introspection and autocomplete |

## How It Works

```
Terminal input
      │
      ▼
┌─────────────────────────────────────┐
│            REPL (repl.ts)           │
│                                     │
│  Built-in variables:                │
│    context  → ContextRegistry       │
│    client   → RawHttpClient         │
│    route    → RouteBuilder factory  │
│                                     │
│  Dot-commands:                      │
│    .proxy on <path>   enable proxy  │
│    .proxy off         disable proxy │
│    .help              show commands │
└─────────────────────────────────────┘
```

The REPL exposes the live `ContextRegistry` so any JavaScript expression that reads or mutates context objects takes effect immediately, just like editing the context file would — but without a file save or hot-reload cycle.

`RawHttpClient` lets you send HTTP requests directly from the REPL prompt:

```
⬣> client.get("/pet/1")
⬣> client.post("/pet", { name: "Rex", photoUrls: [] })
```

`RouteBuilder` (exposed as `route()`) is a composable, OpenAPI-backed request builder:

```
⬣> const pet = route("/pet/{petId}").method("get").path({ petId: 1 })
⬣> pet                     // shows parameter status and readiness
⬣> pet.help()              // shows OpenAPI docs for the operation
⬣> pet.ready()             // true / false
⬣> pet.missing()           // lists missing required parameters
⬣> await pet.send()        // executes the request
```

