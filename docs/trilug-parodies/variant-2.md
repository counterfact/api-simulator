> **Variant 2 — The frustrated frontend developer's spin**

---

**From:** frontend_dev_42@company.example (A Very Patient Frontend Developer)  
**Newsgroup:** comp.os.waiting-on-backend  
**Subject:** What would you like to see most in a backend that actually exists?  
**Summary:** small poll for everyone blocked on "API not ready yet"  
**Date:** Some sprint, some year  

---

Hello everybody out there blocked on the backend team —

I'm doing a (free) API simulator (just a hobby, won't hold up the whole sprint
or anything) for teams who hear "the API will be ready soon" every single
standup. This has been brewing since I got tired of hardcoding fake responses
that stopped matching the spec by Tuesday, and is starting to get ready.

I'd like any feedback on things people like/dislike about existing workarounds,
as Counterfact resembles them somewhat (it still intercepts HTTP calls) while
also doing the things they can't: shared state, failure injection, live control
at runtime.

I've currently ported TypeScript code generation (1.0) and a REPL (it actually
works), and things seem to work. This implies that you will get something
practical within minutes of running one command, and I'd like to know what
features would unblock you most. Any suggestions are welcome, but I won't
promise I'll implement them before your next standup :-)

— Patrick (counterfact@github.com)

P.S. Yes — the backend team will still say "API not ready yet" on Monday. But
you'll have already shipped, so it won't matter. It is NOT a real backend (just
a very convincing fake), and it probably never will be, as that's the backend
team's job :-(

---

```sh
npx counterfact@latest https://petstore3.swagger.io/api/v3/openapi.json api
```
