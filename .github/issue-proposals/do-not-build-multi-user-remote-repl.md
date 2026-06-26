---
title: Do not build a multi-user remote REPL
---

The REPL should not be exposed on a separate machine for multiple users to connect to.

That design would create a highly insecure shared control surface over live server state, with no obvious safe authorization, isolation, or audit model.

## Acceptance criteria

- Document that a remote multi-user REPL is not a safe feature to build
- Record the security and isolation risks clearly enough to discourage future implementation
- Leave a durable note for future contributors so the idea is not revisited casually
