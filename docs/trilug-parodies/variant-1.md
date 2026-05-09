> **Variant 1 — Faithful close parody of Linus's original email**

---

**From:** mcelhaney@somewhere.internet (Patrick McElhaney)  
**Newsgroup:** comp.api.tooling  
**Subject:** What would you like to see most in mock servers?  
**Summary:** small poll for my new API simulator  
**Date:** 2024 Aug 25

---

Hello everybody out there using Postman/WireMock —

I'm doing a (free) API simulator (just a hobby, won't be big and professional
like Swagger UI) for OpenAPI specs. This has been brewing since last year, and
is starting to get ready. I'd like any feedback on things people like/dislike
in existing mock servers, as Counterfact resembles them somewhat (same idea of
intercepting HTTP calls) among other things.

I've currently wired in TypeScript code generation and a live REPL, and things
seem to work. This implies that I'll get something practical within a few
months, and I'd like to know what features most people would want. Any
suggestions are welcome, but I won't promise I'll implement them :-)

— Patrick (counterfact@github.com)

P.S. Yes — it's free of any Postman code, and it has a multi-route stateful
context. It is NOT a simple proxy (it actually runs your TypeScript handlers),
and it probably never will pretend to be a full production backend, as that's
not what it's for :-(

---

```sh
npx counterfact@latest https://petstore3.swagger.io/api/v3/openapi.json api
```
