# Lint warning recommendations

Baseline (2026-04-16): `yarn lint` reports 123 warnings across 8 rules.

> Historical assessment, recorded at
> [commit f144c91](https://github.com/counterfact/api-simulator/tree/f144c91e737eeaf0bf492b733c2ca0abf530f524).
> Counts and recommendations refer to the dated run above. For current rule
> configuration, inspect [eslint.config.js](../../eslint.config.js) and run
> `yarn lint` for current diagnostics.

| Rule                                      | Warnings | Recommendation                       | Why                                                                                                                                                               |
| ----------------------------------------- | -------: | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `security/detect-non-literal-fs-filename` |       50 | Selectively fix or ignore violations | Most hits are expected dynamic paths in file-system tooling; keep the rule for signal, but use validation wrappers and targeted ignores where inputs are trusted. |
| `security/detect-object-injection`        |       42 | Selectively fix or ignore violations | Many hits are dynamic key lookups on known maps. Keep the rule, but prefer `Map`/guarded access in risky paths and suppress known-safe cases.                     |
| `jest/no-conditional-in-test`             |       17 | Selectively fix or ignore violations | Some conditionals are legitimate for shared test helpers/table-driven cases; rewrite simple cases, keep explicit ignores for intentional patterns.                |
| `import/no-named-as-default-member`       |        4 | Disable it                           | Current warnings are false-positive noise from `js-yaml` interop in tests; disabling improves signal-to-noise.                                                    |
| `regexp/prefer-named-capture-group`       |        3 | Fix violations                       | Small, mechanical updates (`(?:...)` or named groups) improve readability and can be fixed quickly.                                                               |
| `jest/expect-expect`                      |        3 | Selectively fix or ignore violations | Some tests assert by expecting thrown errors/side effects through helpers; add explicit assertions where possible and ignore intentional patterns.                |
| `security/detect-unsafe-regex`            |        2 | Selectively fix or ignore violations | One warning is from tooling config; review each regex for ReDoS risk and suppress only proven-safe patterns.                                                      |
| `jest/no-disabled-tests`                  |        2 | Fix violations                       | Skipped tests should be either re-enabled or removed to avoid long-term blind spots.                                                                              |

## Suggested priority

1. Fix now: `regexp/prefer-named-capture-group`, `jest/no-disabled-tests`
2. Selective cleanup: `security/*`, `jest/no-conditional-in-test`, `jest/expect-expect`
3. Disable: `import/no-named-as-default-member`
