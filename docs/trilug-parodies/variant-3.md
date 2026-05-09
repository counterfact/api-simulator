> **Variant 3 — The AI-age update spin**

---

**From:** mcelhaney@somewhere.internet (Patrick McElhaney)  
**Newsgroup:** comp.ai.agents  
**Subject:** What would you like to see most in AI sandboxes?  
**Summary:** small poll for my new programmable API environment  
**Date:** 2024 Aug 25

---

Hello everybody out there building AI coding agents —

I'm doing a (free) API simulator (just a hobby, won't be big and professional
like a full integration test suite) for agents that need to call real-looking
APIs without touching production. This has been brewing since GPT-4 arrived and
everyone started wondering how to give LLMs a stable surface to iterate on, and
is starting to get ready.

AI agents are terrible at flaky APIs. They retry. They hallucinate. They give
up. What they need is an API that behaves *exactly* the same way every time —
or *exactly differently* when you want to test an error path. Counterfact is
that: a live, stateful, programmable sandbox built from your OpenAPI spec.

I've currently wired in TypeScript handler generation, hot reloading, and a
REPL you can drive programmatically, and things seem to work. This implies that
you'll have a stable environment for your agent within seconds of running one
command, and I'd like to know what features would make it most useful. Any
suggestions are welcome, but I won't promise I'll implement them before your
agent figures out it can just ask me directly :-)

— Patrick (counterfact@github.com)

P.S. Yes — it works without a real backend, and it has full shared state across
routes. It is NOT production-grade infrastructure, and it probably never will
replace your real API, as that's kind of the whole point. But your agent doesn't
know the difference, and for testing purposes that's exactly what you want :-)

---

```sh
npx counterfact@latest https://petstore3.swagger.io/api/v3/openapi.json api
```
