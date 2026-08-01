# ADR: Onboarding — First-Run Experience

## Status

Proposed

## Context

New users who run Counterfact for the first time receive only the ASCII-art startup banner and a set of links (usage guide, Swagger UI, GitHub). There is no structured guidance on what to do next, and we have no signal about who our users are or what they are trying to accomplish.

Three onboarding designs were considered:

1. **CLI interactive survey on first run** — a short `inquirer`-style prompt sequence shown in the terminal the first time Counterfact starts, asking the user's role and primary use case, followed by an explicit PostHog consent prompt.
2. **Web dashboard welcome wizard** — a multi-step modal overlay on the first visit to `/counterfact/`, culminating in an optional in-browser survey whose answers are POSTed to a new Koa endpoint and forwarded to PostHog on consent.
3. **Progressive disclosure with deferred survey nudge** — no up-front prompt; contextual tips appear inline as the user explores the tool, and a small non-blocking survey nudge appears only after an engagement threshold (panel dismissed or ≥ 5 minutes since first visit).

### Key constraints

- Counterfact is a CLI tool first; the terminal is the primary surface for first-run communication.
- Any data collection must be gated behind explicit user consent; results are sent to PostHog only when the user opts in.
- The onboarding flow must never block or delay server startup.
- The survey should be skipped entirely when `CI=true` or stdin is not a TTY.
- The `counterfact.yaml` file (planned as the canonical user-facing config file) is the right place to persist the "onboarding complete" flag.

## Decision

**Design 1 — CLI interactive survey on first run — is selected.**

The precise survey questions are still to be determined and will be finalised before implementation begins.

On first run (detected by the absence of an `onboardingCompleted` key in `counterfact.yaml`), after the startup banner is printed, Counterfact presents a short interactive prompt sequence:

1. A multiple-choice question asking the user's role (e.g. Frontend developer, Backend / API developer, QA / test automation, Full-stack developer, Other).
2. A multiple-choice question asking their primary use case (exact options TBD).
3. A consent prompt: "May we send these answers anonymously to the Counterfact team via PostHog?"

If the user consents, a `onboarding_survey_completed` PostHog event is fired using the existing fire-and-forget pattern already established in `bin/counterfact.js`. If the user declines, no data is sent and the answers are discarded. Regardless of the consent choice, `onboardingCompleted: true` is written to `counterfact.yaml` so the survey is never shown again.

The survey is skipped when `CI=true`, when stdin is not a TTY, or when non-interactive flags (`--no-repl`, `--no-open`) are in use.

## Options

### Design 1: CLI interactive survey (selected)

A first-run prompt sequence in the terminal. Minimal dependencies; the terminal is already the user's context when Counterfact starts.

**Why chosen:** The terminal is where the user already is. An in-terminal survey has the highest completion likelihood, requires no new browser UI, and reuses the PostHog client already present in `bin/counterfact.js`. It is the simplest path to gathering useful feedback while respecting the CLI-first nature of the product.

**Open question:** The exact survey questions need to be decided before implementation begins.

### Design 2: Web dashboard welcome wizard

A four-step modal overlay on first visit to `/counterfact/`. Richer medium, but requires the user to navigate to the dashboard and adds browser-side state management and a new Koa endpoint.

**Why not chosen (yet):** Requires more implementation surface (new Koa route, `localStorage` detection, HTML/JS overlay). Better suited as a follow-up once the CLI survey baseline is established.

### Design 3: Progressive disclosure with deferred survey nudge

No up-front friction; engagement-gated nudge after the user has used the tool. Least disruptive but also least likely to yield survey responses from new users who churn early.

**Why not chosen:** The delayed trigger means users who disengage quickly — precisely the ones whose feedback we most need — will never see the survey.

## Consequences

### What this enables

- First-time users receive clear in-terminal guidance immediately after startup.
- We gain structured signal about who uses Counterfact and why, which can inform roadmap priorities.
- The PostHog event data complements the existing `counterfact_started` event with demographic context.

### Trade-offs accepted

- Requires adding `inquirer` (or equivalent ESM-compatible prompter) as a production dependency.
- The `counterfact.yaml` config file must be created if absent; the schema should be forward-compatible with future user preferences.
- Users who run non-interactively (CI, pipes) will never see the survey — this is intentional.

### Risks and downsides

- Survey completion rates may be low if users dismiss the prompt quickly or choose "No thanks" at the consent step.
- The survey adds a small delay to first-run startup (a few seconds of user interaction); this is acceptable because it happens only once and is gated on TTY availability.
- Adding `inquirer` as a dependency increases the package footprint.

### Follow-up work

- Finalise the survey questions before implementation begins.
- Define the `counterfact.yaml` schema (at minimum the `onboardingCompleted` key) before implementing the survey persistence.
- Evaluate whether Design 2 (web wizard) is worth building as an additional onboarding layer once the CLI survey is shipped.

## Advice

- **Do not start implementing the survey** until the questions are finalised and this ADR's status is updated to `Accepted`. (Copilot/Claude)
- **Read `counterfact.yaml`** at startup to check `onboardingCompleted`; write the flag back at the end of the prompt flow regardless of consent choice. (Copilot/Claude)
- **Reuse the existing PostHog client** in `bin/counterfact.js` for the survey event. Keep it fire-and-forget; never let a PostHog failure surface to the user. (Copilot/Claude)
- **Guard the prompt on `process.stdin.isTTY`** (and `CI` env var) before showing it. Server startup must proceed immediately when the prompt is skipped. (Copilot/Claude)
- **Keep the prompt short** — two questions plus a consent step. Any longer and completion rates will drop sharply. (Copilot/Claude)
