---
name: counterfact
description: >
  Understand Counterfact architecture and generated project structure before
  editing generated API simulation code.
applyTo:
  - "**/*.{yaml,yml,json}"
  - "**/routes/**/*.{ts,js}"
  - "**/scenarios/**/*.{ts,js}"
  - "**/*context.{ts,js}"
---

# Counterfact Skill

## Purpose

Give agents a quick, practical overview of Counterfact so they can safely edit
Counterfact-generated projects.

## What Counterfact is

Counterfact generates a working mock API from an OpenAPI/Swagger specification.
It creates route handler files and types, then runs a live server with hot
reload and a REPL.

## How Counterfact works

1. Parse an OpenAPI spec.
2. Generate route handlers under `routes/` and types under `types/`.
3. Serve endpoints through the generated handlers.
4. Keep mutable runtime state in `_.context.ts` files.
5. Seed/modify state via `scenarios/` and REPL scenario commands.

## Editing guidance

- Treat `routes/` as the place for HTTP glue (status code + response mapping).
- Put business logic/state mutation in context classes, not handlers.
- Use scenarios for dummy data and reusable setup flows.

## Documentation

- https://countefact.dev
- https://counterfact.dev
