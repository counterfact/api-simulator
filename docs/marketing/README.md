# Counterfact adoption program

This directory is the operating record for the founder-led 90-day adoption
program. Counterfact's primary audience is a TypeScript frontend developer who
has an OpenAPI document and cannot depend on a finished, available backend.

The promise is **Build the frontend. Don't wait for the backend.** Generated
responses are a contract-shaped starting point, not a claim that production
business behavior is complete.

## Quarterly OKRs

Baseline is the average of weeks 1–2. Target is the average of weeks 11–12.
Always report raw numerator and denominator beside a rate. Treat rates as
directional until the cohort contains at least 100 eligible sessions or
installations.

### Objective 1: Qualified discovery

- Increase qualified non-branded organic sessions to the homepage and Getting Started by 50%.
- Increase quick-start intent events by 40%, with at least 20% homepage-to-intent conversion or a five-point improvement over baseline.
- Earn six relevant independent references; automated indexes and maintainer reposts do not count.

### Objective 2: First useful request

- Increase weekly activated installations by 35%.
- Reach at least 85% start success and 60% successful-start-to-first-request conversion; improve an already-higher baseline by five points.
- Reduce the most common actionable first-run failure category by 30%.

### Objective 3: Repeat workflow use

- Reach a 25% 14-day return rate and measure the available 28-day cohorts.
- Secure five permissioned proof points, including two observable frontend workflows.
- Have the React/Vite and Playwright examples each used, referenced, forked, or discussed by three external developers.

## Funnel definitions

- **Website intent:** a successful quick-start copy, Getting Started open, ecosystem example open, comparison open, or GitHub open.
- **Start success:** `counterfact_started / counterfact_start_attempted`.
- **Activated installation:** a rotating anonymous installation that starts successfully and reports `first_api_request_served` in the same session within 30 minutes.
- **Deep activation:** an activated installation followed by a route, context, scenario, or OpenAPI change.
- **14-day return:** an activated installation active on a second distinct day within 14 days.
- **28-day retention:** an activated installation active in its first and fourth weekly windows.

Website and CLI identities must never be joined. Downloads, stars, forks, and
traffic are context, not substitutes for activation or retention.

## Weekly operating cadence

- 30 minutes: dashboard and guardrails.
- 90–120 minutes: current runnable example or cornerstone artifact.
- 45–60 minutes: one adapted distribution artifact.
- 45–60 minutes: one observed first run or user conversation.
- 60–90 minutes: highest-value onboarding or documentation correction.
- 30 minutes: discussions, follow-up, and evidence capture.

Limit work to two active experiments. Do not buy ads during the first quarter.
Optional recording, transcription, and creative tooling is capped at $250.

## Decision rules

Continue work that produces an activated installation, permissioned proof
point, or specific onboarding learning per two founder hours and does not
underperform the blended activation baseline. Revise work that attracts the
right visitor but loses them at intent or activation. Stop work after two
cycles when it produces only broad engagement, attracts an unsupported
audience, or consumes more than one-quarter of weekly capacity.

Use [weekly-scorecard.md](./weekly-scorecard.md) for reporting and
[experiment-register.md](./experiment-register.md) before starting a campaign.
The three approved campaign briefs are in [campaigns.md](./campaigns.md).
