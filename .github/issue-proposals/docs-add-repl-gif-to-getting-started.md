---
title: "docs: add GIF demo of REPL to getting-started.md"
parentIssue: 1712
labels:
  - documentation
assignees: []
milestone:
---

The REPL section in `packages/counterfact/docs/getting-started.md` is a great place to show an animated GIF demonstrating what the REPL looks like in action — typing a command, hitting enter, and seeing the response appear.

## Context

`packages/counterfact/docs/getting-started.md` currently has a text block showing example REPL output:

```
⬣> context.list()
[ { id: 1, name: 'Fluffy', status: 'available' } ]

⬣> context.add({ name: 'Rex', photoUrls: [], status: 'pending' })
{ id: 2, name: 'Rex', photoUrls: [], status: 'pending' }

⬣> client.get("/pet/2")
{ status: 200, body: { id: 2, name: 'Rex', ... } }
```

A short GIF here would do a better job than text of showing:

- what the terminal prompt looks like
- how fast the REPL responds
- what colorized output looks like

## Acceptance criteria

- [ ] A GIF or animated screencast is added below the REPL code block in `packages/counterfact/docs/getting-started.md`
- [ ] The GIF shows at least two REPL interactions (e.g., `context.list()` and `client.get(...)`)
- [ ] The GIF is committed to the repository (e.g., under `docs/assets/`) or hosted at a stable public URL
- [ ] The image renders correctly in GitHub Markdown preview
