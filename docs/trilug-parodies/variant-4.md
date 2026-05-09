> **Variant 4 — Overly dramatic / epic spin**

---

**From:** mcelhaney@somewhere.internet (Patrick McElhaney)  
**Newsgroup:** comp.os.revolution  
**Subject:** What would you like to see most in the future of API development?  
**Summary:** small poll for the tool that will change everything (or at least save some sprints)  
**Date:** The Dawn of a New Era  

---

Hello everybody out there suffering under the tyranny of "the API isn't ready yet" —

For too long, frontend developers have been held hostage. For too long, test
engineers have fought mock servers that forget state between requests. For too
long, AI coding agents have crashed against flaky endpoints like waves against
an indifferent shore.

I am doing a (free) API simulator. It is just a hobby. It will not be big and
professional like WireMock or imposing like Prism. It is one command, one spec,
and then: freedom.

Point it at an OpenAPI document. Counterfact generates a TypeScript handler for
every endpoint — every single one — and starts serving traffic in seconds. Edit
a handler. Watch it reload. No restart. No ceremony. The REPL is already
waiting, ready to help you inject failures, seed state, or flip a proxy on and
off mid-flight while your tests are running.

I've ported TypeScript (the good kind), hot reloading, and a control surface
worthy of a test engineer's ambitions, and things seem to work. Within minutes
of running one command, the backend is no longer an excuse.

Any suggestions are welcome, but I won't promise I'll implement them before
the revolution is complete :-)

— Patrick (counterfact@github.com)

P.S. Yes — it is free, open source, and carries no legacy baggage from the mock
server wars of the 2010s. It IS stateful by design (shared context across all
routes, always), and it probably WILL change how you think about building
against APIs, because once you've used a REPL to flip your server into chaos
mode mid-test, you won't go back. I am just saying. :-)

---

```sh
npx counterfact@latest https://petstore3.swagger.io/api/v3/openapi.json api
```
