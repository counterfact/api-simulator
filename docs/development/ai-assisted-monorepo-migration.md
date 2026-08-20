# How I Used AI to Turn Counterfact into a Package-Oriented Monorepo

_August 6, 2026_

On March 31, 2026, I took part in a conversation with people who use
Counterfact in real projects. We discussed the request builder, generated
TypeScript clients, using externally generated models, OpenAPI overlays,
record-and-replay, and the possibility of making pieces of Counterfact
independently consumable.

Counterfact is an OpenAPI-driven API simulator. It generates typed route
scaffolding and gives frontend developers a controllable backend sandbox, while
still allowing traffic to be proxied to a real API when that is useful.

A few months later, I gave an AI coding agent the transcript and asked it to
compare that discussion with the repository as it existed now. That review led
to a consequential choice: before adding another major feature, I wanted to
make the useful parts of Counterfact available as separate packages.

The result was not a one-shot refactor. It was an 18-commit migration organized
into a plan, a compatibility baseline, seven structural phases, and a separate
review of the plan after every phase. Git summarizes the branch as 351 changed
files, 6,554 additions, and 1,477 deletions. More importantly, it ends with
seven independently testable packages, a compatibility facade, enforceable
dependency boundaries, installed-tarball tests, and a release process that is
ready for review without having published anything.

This is how I used AI to do it, where the difficult parts were, and what I
learned about directing agents through a large architectural change.

## The important decision came before the implementation

The first useful outcome was not code. It was sequencing.

The product discussion contained several appealing directions: client
generation, model interoperability, independently usable OpenAPI tooling, and
more. I decided that the package boundaries should come first. Otherwise, each
new feature would deepen the coupling inside the existing package and make the
eventual separation harder.

I then asked the agent to create a branch and write the plan before changing
the implementation. The plan became an architecture decision record, or ADR.
It defined the intended packages and, just as importantly, the allowed
dependency direction:

- `@counterfact/types` is the dependency-light leaf.
- `@counterfact/openapi` owns document loading and overlays without application
  lifecycle concerns.
- `@counterfact/generator` and `@counterfact/runtime` are independent siblings.
- `@counterfact/client` works without starting the simulator or REPL.
- `@counterfact/repl` composes narrow client and runtime contracts.
- `counterfact` remains the familiar product package, CLI, and compatibility
  facade.

Writing that down mattered. Moving directories is easy compared with deciding
which package owns a concept, which direction dependencies may flow, and which
existing behavior must remain unchanged.

## I used checkpoints instead of one giant prompt

I asked the agent to treat the ADR as a living document. Each phase had two
commits: one for the implementation and one for what we learned. If a phase did
not change the plan, I still wanted an empty checkpoint commit so the history
would show that the review happened.

I also asked it to use subagents. Each subagent received a bounded unit of work
with less context to hold at once. The primary agent remained responsible for
integration, verification, and the final architectural decisions. That split
was useful: a focused agent could investigate a package boundary or release
workflow, while the primary agent kept the whole dependency graph and
compatibility contract in view.

The migration proceeded in this order:

1. Freeze the installed-package compatibility contract.
2. Move the existing package into a workspace without splitting behavior.
3. Extract shared TypeScript contracts.
4. Extract OpenAPI document handling.
5. Extract the generator.
6. Extract the runtime.
7. Extract the client and REPL.
8. Harden the facade, package boundaries, tarballs, and release path.

I deliberately paused after the first structural phase. That gave me a clean
point to inspect the monorepo shell before authorizing the deeper extractions.
Short prompts such as “Pause after Phase 1 is complete” and “Do the rest of the
phases” were enough because the durable detail lived in the repository, not in
an ever-growing chat instruction.

The smaller corrections mattered too. When formatting checks failed, I asked
the agent to repair and commit the Prettier baseline before continuing. When I
noticed that I had typed “pages” instead of “changes” in the empty-commit rule,
I corrected the instruction directly. Neither prompt required a new master
plan; both kept the execution contract precise and the later diffs reviewable.

## The repository supplied the context

The agent did not design the migration from a generic monorepo recipe. It read
the code, manifests, tests, build configuration, documentation structure, and
automation already present in Counterfact.

That context established the constraints:

- The `counterfact` binary and root package import had to keep working.
- Existing CLI flags, configuration, generated directory layouts, and hot
  reload behavior were compatibility contracts.
- Generated simulations had to remain self-contained; extracting a types
  package could not silently add a runtime dependency to generated projects.
- Yarn 1, TypeScript project references, Jest, TSD, Python black-box tests, and
  Changesets all had to understand the new layout.
- User documentation belonged with the published facade, while ADRs and
  development records belonged at the repository root.
- The runtime's compiler integration required the existing TypeScript 6 line,
  so a package move could not casually become a compiler upgrade.

The imports also told the truth about the architecture. The generator reached
into server configuration. Runtime code relied on a generator-owned constant.
The REPL and runtime reached upward into CLI telemetry. OpenAPI loading was
coordinated in several places. Those were not merely paths to update; they were
ownership problems to resolve.

This was one of the most valuable aspects of the process: the repository acted
as long-term memory. The ADR held intent, tests held observable behavior,
manifests held packaging promises, and each phase's diff showed the next piece
of coupling to address. The chat could stay comparatively small because the
source of truth was checked in.

## The difficult parts were at the boundaries

### A workspace import is not proof of a usable package

Workspace tooling is helpful, but it can hide missing dependencies and files.
A package may work inside the monorepo because another workspace, a root
dependency, or an unexported source path happens to be available.

The solution was to treat an installed tarball as the real unit of proof. The
final closure harness builds the repository once, packs every workspace once,
and creates an isolated consumer for each package. Each consumer receives only
that package's recursive Counterfact tarball dependency closure. The harness
then:

- checks the installed dependency graph;
- imports every declared export;
- verifies that representative deep imports fail;
- compiles declarations under strict TypeScript settings;
- checks required documentation and runtime assets;
- rejects source, tests, and TypeScript build metadata in the tarball; and
- runs or type-checks the documented example from the installed package, not
  from the repository checkout.

That last detail came from an independent agent audit. The first version only
verified that an `examples` directory existed, then ran the source copy. The
audit caught the gap before the phase was committed.

### Shared types had two different consumers

The new `@counterfact/types` package needed to serve packages inside the
monorepo. Generated Counterfact projects, however, already received a local
`counterfact-types` source directory and did not require an installed package.

It would have been easy to “clean up” both designs at once. That would also
have changed the generated-project contract. Instead, internal packages import
`@counterfact/types`, while the generator continues copying compatible source
templates into generated projects. The new package boundary and a future
generated-code dependency decision remain separate migrations.

### Side effects had to move upward

OpenAPI loading, runtime watching, REPL commands, and telemetry were tangled
together in the original application. A reusable package cannot quietly own
CLI policy or a long-running lifecycle.

The extraction repeatedly used the same pattern: keep the focused package
responsible for its mechanism and inject the product-level policy from the
facade. Watchers stay with their consumer. Runtime and REPL event reporting use
guarded callbacks. The runtime accepts narrow configuration and Admin API
adapters. The client accepts a route catalog instead of importing the runtime
dispatcher.

Those seams made the packages independently useful without inventing a vague
`core`, `common`, or `shared` package that would merely hide the coupling.

### Assets and build state mattered as much as TypeScript source

The runtime needed a CommonJS cache-busting helper beside its emitted loaders.
The generator needed its type-template sources inside its own tarball. The
facade needed its binary, documentation, changelog, and declaration entry
points. Package extraction was therefore a build-and-distribution problem, not
just an import-rewrite problem.

One particularly subtle failure involved TypeScript incremental state. Build
metadata had been moved outside the package directories so it would not ship.
After a no-emit typecheck, TypeScript could consider a project current even
though `dist` had been removed. A later normal build could therefore leave the
package with no output. The fix was to force emission for package builds and
clear the shared external build cache in the one-build closure rehearsal.

### Release automation needed its own safety boundary

Making a manifest public is not the same as authorizing publication.

The six focused packages now contain public-ready metadata, explicit exports,
documentation, examples, licenses, and provenance configuration. The branch
does not authenticate to npm, create the packages, configure trusted
publishers, or publish a release.

The first release-workflow draft attached the `npm-publish` environment to the
entire job. An audit pointed out that this would ask for approval before
preflight, and would make ordinary version-PR preparation share the publication
gate once the environment's protection rules were configured. The final
workflow separates the two. Normal pushes run the non-publishing preflight and
prepare the Changesets pull request. Publication requires a manual request, no
pending changesets, and a successful preflight; it is designed to require
approval of the downstream npm environment after its protection rules are
configured.

The same audit found two more issues: Renovate examined only the latest commit
rather than the full pull-request diff, and the tarball harness did not prove
that the exact documented example shipped. Both were corrected before the
phase commit. AI was useful not only as an implementer, but also as a skeptical
reviewer of other agents' work.

## The living ADR changed the quality of the work

The ADR started as a plan and ended as a record of what actually happened.
After every phase, the agent inspected the result and added findings that could
not have been known from the initial design alone:

- The compatibility baseline found a declaration entry that pointed to output
  the build did not emit.
- Moving the package revealed that the ESLint ignore configuration did not
  exclude nested build directories.
- TSD's temporary program conflicted with running inside a composite child
  project, so the tests stayed package-owned but root-invoked.
- The generator needed to own its source templates rather than discover them
  through the facade's output.
- Product configuration belonged in the facade, while runtime received narrow
  structural contracts.
- Extracting the REPL exposed and fixed an existing double-callback completion
  path.
- Moving build metadata exposed the no-emit incremental-build problem.
- Reviewing the release design improved when approval occurs and what ordinary
  repository events are allowed to do.

This is why I did not want the ADR written once and treated as finished. A good
plan creates a direction. A living decision record captures the better design
that emerges when the code pushes back.

## Verification was part of the implementation

The final local verification included:

- 64 unit-test suites;
- 911 passing tests and one todo;
- 127 snapshots;
- all seven isolated installed-package closures;
- nine boundary-checker tests and validation of all seven workspaces;
- the facade's packed-consumer test;
- 13 Python black-box tests;
- TSD declaration tests;
- formatting and workflow validation; and
- lint with zero errors.

The CI configuration now runs the relevant package checks on Linux and
Windows, but the branch was intentionally left local: it was not pushed,
published, or turned into a release as part of this task.

## What I learned

First, effective AI-assisted development is less about writing one perfect
prompt than about constructing a reliable feedback loop. The branch, ADR,
tests, commit history, and phase boundaries did more to keep the work coherent
than a massive initial instruction could have done.

Second, reducing context can improve reasoning. Subagents were most useful
when their jobs were narrow and independently checkable. The primary agent's
job was not to do every edit; it was to preserve architectural intent, resolve
conflicts between local solutions, and demand evidence at integration points.

Third, compatibility should be frozen before structure moves. The installed
binary, root import, generated output, documentation, and declarations were
tested before the first directory relocation. That changed the question from
“does the refactor look right?” to “does the installed product still behave
the same?”

Fourth, package design is dependency design. The hard work was not creating
seven `package.json` files. It was deciding where state, side effects, assets,
configuration, and policy belonged—and then enforcing that direction so the
repository could not quietly drift back.

Finally, human steering remained essential. I chose the architectural priority,
required the plan, corrected a typo in the process contract, stopped the work
at a review boundary, called out formatting failures, and explicitly authorized
the remaining phases. The AI supplied speed, breadth, implementation effort,
and repeated review. The outcome came from combining those strengths with a
process that made mistakes visible early.

## What this migration deliberately did not do

The package work created places for future features; it did not pretend to
deliver all of them. Production TypeScript SDK generation, adapters for models
from third-party generators, HAR import and record-and-replay, persistent
simulator state, changes to generated directory contracts, and replacing Yarn
or Changesets remain separate opportunities.

The first npm release is also still pending. Package creation, trusted-publisher
configuration, provenance verification, publication, and any announcement
require explicit maintainer actions after the branch is reviewed.

## The prompts

Below are all of the prompts I gave the agent during this task, reproduced
verbatim. The summit transcript itself is intentionally omitted.

### 1

```text
Review this transcript from March 31, 2026. Create a list of features related to this discussion that have been added since then. Create a separate list of opportunities that remain.
```

### 2

```text
I'm thinking it would make sense to do the separate consumable packages first. And turn the repo into a monorepo.
```

### 3

```text
Create a branch, create a plan to break up the packages and make Counterfact a monorepo, and commit the plan to the branch.
```

### 4

```text
Begin implementing the plan. Treat the ADR as a living document. After each phase, commit, look for opportunities to refine the plan, and commit again. (If there are no pages, create an empty commit.)

Use subagents so that each unit of work has a smaller context.

Before you begin, review the approach I just described, and let me know if you have any concerns or suggestions.
```

### 5

```text
I meant "If there are no changes", not pages
```

### 6

```text
Fix the prettier failures and commit.
```

### 7

```text
Pause after Phase 1 is complete.
```

### 8

```text
Do the rest of the phases
```

### 9

```text
When you're done, write a blog post about how I used AI to complete a large, complex task. Include all of the prompts I gave you verbatim (except the text of the transcript). Write about the challenges associated with splitting out packages and building a monorepo, how context in the repo guided you, how you broke it down into steps, and what you learned along the way.
```

## The result

Counterfact still presents one straightforward product package, but its useful
parts now have explicit, independently consumable boundaries. The repository
can detect architectural back-edges, prove packages from their installed
tarballs, and rehearse a multi-package release without performing one.

That is the part of AI-assisted development I find most promising. It is not
just faster code generation. With deliberate checkpoints and strong repository
context, it can make architectural work more observable, reviewable, and
disciplined—even while moving much faster than I could alone.
