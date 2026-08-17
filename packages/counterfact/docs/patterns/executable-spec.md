# Executable Spec

Make an OpenAPI document something you can run. See the effect of each spec change in a live server before clients and backend code are committed to it.

## Why teams use this

API design happens in a document — the OpenAPI spec — while the feedback comes much later, when clients are built and integrated. By then, mistakes in the spec are expensive to fix.

## How it works

Run Counterfact with `--watch` while authoring the spec. Every time you save the spec, types regenerate and the server reflects the updated contract instantly. You can send real requests to observe how a spec change would behave, and TypeScript surfaces any handler that no longer matches the updated contract — while the server is still running.

## Example

Start with a spec for a pet clinic API and run Counterfact in watch mode:

```sh
npx counterfact@latest openapi.yaml api --watch --serve
```

Now add a new `Vaccination` component to the spec and attach vaccination records to the `Pet` schema:

```yaml
components:
  schemas:
    Vaccination:
      type: object
      properties:
        vaccine:
          type: string
        date:
          type: string
          format: date
    Pet:
      type: object
      properties:
        id:
          type: integer
        name:
          type: string
        vaccinations:
          type: array
          items:
            $ref: "#/components/schemas/Vaccination"
```

Save the file. Counterfact regenerates the types immediately. The GET `/pet/{petId}` handler's return type now includes `vaccinations`. If the handler uses the default `random()` implementation, the server already returns the new field automatically:

```
⬣> client.get("/pet/1")
{ status: 200, body: { id: 1, name: 'Fluffy', vaccinations: [{ vaccine: 'Rabies', date: '2024-03-15' }] } }
```

If the handler returns a fixed value, you will need to update it — but TypeScript guides you: the IDE highlights the mismatch and describes exactly what is missing or incorrect. You can iterate on the spec — adding fields, changing types, restructuring schemas — and see the downstream effects on handlers and responses before any client code is written.

## What you get

- Feedback on spec changes is instantaneous: save the spec, observe the effect on the running server.
- Type warnings appear in the IDE when handlers no longer match the updated contract; the server keeps running during the transition.
- The pattern works best during early API design, when the spec is still fluid and the cost of mistakes is low.
- Handlers must be updated manually to produce semantically correct responses after spec changes; type checking only catches structural mismatches.

## Keep exploring

- [Reference Implementation](./reference-implementation.md) — once the design is stable, implement the supported behavior consumers rely on
- [Explore a New API](./explore-new-api.md) — use a spec you didn't write to explore an existing API the same way
- [Mock APIs with Dummy Data](./mock-with-dummy-data.md) — serve realistic data while the spec is still evolving
