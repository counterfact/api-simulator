# Preflight: 2026-07-31

This run validated the conductor and grader, but it is **not a Counterfact
effectiveness baseline**.

| Condition | Score | Time | Output tokens |
| --- | ---: | ---: | ---: |
| Control | 100/100 | 79.3s | 3,838 |
| Counterfact | 100/100 | 102.8s | 4,718 |

Observed score effect: **0 points**.

## Why this result is not product evidence

The Counterfact agent reported that its workspace sandbox refused connections
to the supplied loopback URL. Its implementation still scored 100 because the
task listed nearly every behavior checked by the grader and the model could
implement those behaviors directly from prose. The benchmark therefore had
two preflight defects:

1. the treatment was not delivered; and
2. implementation correctness saturated, leaving no room to measure better
   empirical verification.

## Changes prompted by the preflight

- The conductor now enables Codex workspace networking only for the
  Counterfact condition and constrains the network proxy to `127.0.0.1`.
- The revised report measures the durable verification artifact an agent
  leaves behind, in addition to hidden implementation checks.
- No claim about Counterfact should cite this preflight. A publishable baseline
  requires at least five successfully connected paired runs.

Keeping this unsuccessful result is intentional: it documents benchmark
iteration, avoids survivorship bias, and makes the eventual evidence easier to
audit.

## Post-fix treatment connectivity check

A treatment-only rerun after the network-policy change produced:

- functional score: **100/100**;
- durable tests: **yes** (five passing tests);
- Counterfact scenarios exercised: **5/5**;
- elapsed time: **153.0 seconds**;
- output tokens: **7,342**.

The sandbox audit recorded real requests for happy-path pagination, 429,
transient 503, permanent 429, and bad-request behavior. This validates delivery
of the treatment, but it is not a paired effectiveness result.
