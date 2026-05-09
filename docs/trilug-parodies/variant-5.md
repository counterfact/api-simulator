> **Variant 5 — Self-aware meta parody**

---

**From:** mcelhaney@somewhere.internet (Patrick McElhaney)  
**Newsgroup:** comp.os.minix.parody  
**Subject:** What would you like to see most in mock servers? (and also I'm doing a parody)  
**Summary:** small poll for my new API simulator, and also a tribute to the most famous email in open source history  
**Date:** 2024 Aug 25

---

Hello everybody out there using Postman/WireMock —

I'm doing a (free) API simulator (just a hobby — and yes, I'm aware I'm
parodying Linus Torvalds' 1991 announcement of Linux, which is funny because
Counterfact will never ship an OS kernel, and also because that email led to
one of the most consequential pieces of software ever written, so the comparison
is a bit absurd, but here we are). This has been brewing since last year, and is
starting to get ready.

Like Linus, I want to know what you need. Unlike Linus, I'm not reinventing an
operating system. I'm just making it possible to run your OpenAPI spec as a live
TypeScript server with shared state, a REPL, hot reloading, and no waiting on
the backend team.

I've currently wired in TypeScript code generation and a live REPL (which, in
the spirit of the original email, I'm describing as "ported bash(1.08) and
gcc(1.40)" in my head), and things seem to work. Any suggestions are welcome,
but I won't promise I'll implement them. Linus didn't either — and look how
that turned out :-)

— Patrick (counterfact@github.com)

P.S. Yes — it's free of any WireMock code, and it has a multi-route stateful
context. It is NOT an operating system (I want to be very clear about that),
and it probably never will support AT hard disks, as I no longer own a 486 :-(.
But it does support any OpenAPI spec you throw at it, which feels like enough
for a Tuesday.

---

```sh
npx counterfact@latest https://petstore3.swagger.io/api/v3/openapi.json api
```
