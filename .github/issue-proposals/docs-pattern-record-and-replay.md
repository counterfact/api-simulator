---
title: "docs: add Record and Replay usage pattern"
parentIssue: 1805
labels:
  - documentation
  - enhancement
assignees: []
milestone:
---

Add a usage pattern documenting a record-and-replay workflow where real API traffic is captured and replayed by Counterfact as a mock.

## Context

Record-and-replay is a common mock strategy supported by tools like WireMock, VCR (Ruby), Polly.js, and others. The idea is: point a proxy at the real API once, record all the responses, then replay those exact responses from the mock without hitting the real API again.

Counterfact currently has no built-in record-and-replay feature. The proxy (`--proxy-url`) forwards requests to the real backend but does not persist the responses. Users who want to bootstrap a mock from real traffic must manually inspect responses and write handlers by hand.

## Proposed feature

Add a `--record` CLI flag (or similar) that, when combined with `--proxy-url`, captures every request-response pair and writes it to the handler files under the output directory. Each captured response is stored as a named example in the handler, so subsequent requests are served from the recorded data without proxying.

A `Record and Replay` usage pattern document would describe:

- When to use it: you want realistic responses without writing handlers by hand, and the real API is available at least once
- How to record: start Counterfact with `--proxy-url` and `--record`, then exercise the relevant API paths
- How to replay: restart without `--proxy-url`; all recorded responses are served from the generated handlers
- Consequences: recorded responses go stale when the real API changes; good for bootstrapping, not for long-lived mocks

## Acceptance criteria

- [ ] A `--record` (or equivalent) CLI flag is implemented that writes captured responses to handler files
- [ ] `packages/counterfact/docs/patterns/record-and-replay.md` is added following the established pattern format (Context, Problem, Solution, Example, Consequences, Related Patterns)
- [ ] The new pattern is linked in `packages/counterfact/docs/patterns/index.md`
- [ ] The reference doc is updated to describe the new CLI flag
