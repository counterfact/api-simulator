# Historical experiment evidence

The complete experiment archive now lives in
[counterfact/historical-experiments at 0d54a52543098ae6570eed78929f2108419d6d69](https://github.com/counterfact/historical-experiments/tree/0d54a52543098ae6570eed78929f2108419d6d69).
It preserves the original environment manifests, dependency locks, reproducers,
logs, instructions, and results byte for byte. Read its root README for reproduction
instructions and the historical dependency security policy.

This directory retains `results.json` and the extraction `artifact-manifest.json`
(a copy of the archive’s `evidence-manifest.json`)
so the case-study pages and calculations can build offline. `archive.json` pins
the archive commit, original source commit, and manifest hash. Artifact paths in
the manifest refer to files in the archive, not local files in this repository.

From `site/`, run `npm run verify:audit` to verify the local data and pinned
manifest. To verify all archived bytes as well, clone the archive, check out
`0d54a52543098ae6570eed78929f2108419d6d69`, then run:

```sh
npm run verify:experiment-archive -- /absolute/path/to/historical-experiments
```

The archive's own `node verify.mjs` also checks all 37 preserved files without
installing or executing the historical environments. New or corrected runs
must be recorded separately rather than overwriting preserved evidence.

The original historical manifest is preserved inside the archive. Four environment
files already differed from its recorded hashes before extraction; the archive's
`MIGRATION.md` documents those differences. This local manifest records the actual
copied bytes and does not claim the historical experiments were rerun.
