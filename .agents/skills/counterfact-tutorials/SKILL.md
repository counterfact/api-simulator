---
name: counterfact-tutorials
description: >
  Change guided Counterfact lessons, progression, saved-handler checks, browser
  tutorial UI, and exercise preparation in @counterfact/tutorials. Use the CLI
  runtime skill for startup, menu selection, ports, or telemetry transport.
applyTo:
  - "packages/tutorials/**"
---

# Counterfact Tutorials Skill

Use this skill for lesson and tutorial behavior. Inspect
`packages/tutorials/README.md`, `packages/tutorials/src/`, and the corresponding
tests before choosing the affected lesson or presentation boundary.

## Ownership and behavior

Keep content, browser UI, progression, saved-handler checks, and exercise
preparation in `@counterfact/tutorials`. Future tours belong in that package.
For CLI integration, read [CLI runtime](../counterfact-cli-runtime/SKILL.md).

- Hands-on tutorials must advance from successful product actions, not typed command text or a saved file alone. Keep the ordinary REPL unchanged when browser instructions can observe app requests directly. Browser tutorials should preserve lesson/cart state only within the same running API session and offer a printed URL if browser launch fails. Keep example contracts in the shipped package and isolate generated examples from existing files. Validate generated browser script syntax and test the actual UI alongside real-terminal and HTTP journeys.

- Group related tutorial phases under a stable lesson title and number. Advance phases from observed responses, keep explicit navigation between concepts, and preserve the saved phase across reloads. Clear or replace feedback when the next action changes so completed edits and recovered failures do not leave contradictory instructions.

- Revisited lessons must work with retained handler edits and live inventory rather than assume pristine fixtures. Offer a context-specific recovery action when needed, and accept behaviorally equivalent experiment quantities instead of treating every departure from example values as an error.

- Saved-handler lesson checks must execute a fresh snapshot of the saved functions with separate context and inventory; never send hidden test purchases through the live shop. Match check results to the source revision and lesson before displaying them so a slow result cannot approve a newer edit. A successful check advances editing instructions, while actual shopper requests still earn purchase completion.

- Browser observations must compare real API snapshots rather than predict mutations or claim specific code executed. Serialize product refreshes with purchases, mark stale/invalid inventory explicitly, distinguish an unknown order confirmation from a rejected order, and preserve the cart for recovery. Render response data as text. Test automatic refresh and failure recovery with controlled responses as well as real CLI journeys.

Tutorial milestone reporting uses the `counterfact:walkthrough` diagnostics
channel; the CLI owns transport and opt-out handling. Coordinate changes to
that boundary with the CLI skill.

## Validation

Run `yarn test:tutorials` for focused lesson/UI checks. When integration changes,
build before checking CLI/HTTP journeys and exercise the actual browser UI.
Verify installed helpers through `yarn test:packed-consumer` when package
contents or generated exercise imports change. Follow
[maintenance](../counterfact-maintenance/SKILL.md) for changesets, documentation,
and broader checks appropriate to behavior changes.
