# Historical experiment archive

results.json is the outcome ledger. reproducers contains exact audit tests copied
into affected worktrees; SHA-256 values are recorded in the ledger. logs contains
unedited focused-Jest stdout and stderr captures from the 2026-09-09 rerun.

## Source pairs

The older release in an affected-ref field is an earliest confirmed affected
bound. It is not necessarily compatible with the repair-era harness. Cases1619,1842,1933,and1971 use the repair merge's immediate first parent and the
repair merge itself. Cases1617and1618 use the older affected tags listed below. Checkout version and first public corrective release differ:

| Issue | affected execution ref | correction merge | checkout package version | first public correction |
| --- | --- | --- | --- | --- |
| 1617 | 8ff2046f6e7ddfd2f58d75c600de0fcc2053ab09 | 59f74e1cf2374290b0499567bbe5ff9107cd011b | see ref | v2.5.0 |
| 1618 | 1db0b22de2998f1abf84e536e74da624840ee0fc | 8587018a0daa9f93b934b6e0060023b954c4fb91 | containing test execution v2.5.0 | v2.5.0 |
| 1619 | 241d6284ac1424669c179ca4538786b97aa11539 | 80dc0732ecb4e6e664dbedc29d1ceac7ce49a366 | v2.4.0 | v2.5.0 |
| 1842 | 60a320e5c9673d5fc0cfd5ec351891869b6f1eb1 | af406dd6a4709d00fbae8b757ff43eb10ddd4bab | v2.7.0 | v2.8.1 |
| 1933 | a67ccaf1f3f2067210fe67c3d8ffd9876036300a | 2997e43c12df3d4214d2302183b618d772c452e3 | v2.9.0 | v2.10.0 |
| 1971 | fd9b7dcb179b45c465fc438244272953ba1d5c8b | 695c1ca39d90d8cc26a8e5448f3209e81ef08e41 | v2.10.0 | v2.11.0 |

## Re-running source pairs

Run file-copy commands from the case-study repository root, using its absolute path when a preceding command has changed directory. The example below uses placeholders for disposable paths; substitute a newly created directory.

For the affected1617and1618 environments, use the effective archived `environments/<issue>/package.json`, `yarn.lock`, and `.yarnrc.yml`, then `npx --yes @yarnpkg/cli-dist@4.18.0 install --immutable --mode=skip-build`. The original setup migrated these locks to Yarn4 and normalized the equivalent package bin map to a string; no source implementation was changed. The effective manifests and dependency locks are included so those adjustments do not need to be guessed. The corrected environment uses Yarn1.22.22 and its committed lock. Jest versions are recorded per case.


Create detached worktrees in a disposable directory outside this repository:

    git worktree add --detach /absolute/disposable/1619-affected 241d6284ac1424669c179ca4538786b97aa11539
    git worktree add --detach /absolute/disposable/1619-corrected 80dc0732ecb4e6e664dbedc29d1ceac7ce49a366
    cd /absolute/disposable/1619-affected && npx --yes yarn@1.22.22 install --frozen-lockfile --ignore-engines --non-interactive
    cd /absolute/disposable/1619-corrected && npx --yes yarn@1.22.22 install --frozen-lockfile --ignore-engines --non-interactive
    mkdir -p /absolute/disposable/1619-affected/test/typescript-generator
    cp /absolute/path/to/case-study/site/study/2026/experiments/reproducers/issue-1619-script.audit.test.js /absolute/disposable/1619-affected/test/typescript-generator/script.audit.test.js
    cd /absolute/disposable/1619-corrected && NODE_OPTIONS=--experimental-vm-modules node ./node_modules/jest/bin/jest.js test/typescript-generator/script.test.js --watchman=false --coverage=false --runInBand --testNamePattern='escapes colons in import paths'
    cd /absolute/disposable/1619-affected && NODE_OPTIONS=--experimental-vm-modules node ./node_modules/jest/bin/jest.js test/typescript-generator/script.audit.test.js --watchman=false --coverage=false --runInBand --testNamePattern='escapes colons in import paths'

Repeat the same six steps for each other immediate pair in the table, using its
matching archived reproducer and the exact command recorded in results.json.
Coverage is disabled because global thresholds are not behavioral evidence for a
focused historical test. The archive records Node 26's ESM VM option, disabled
Watchman, and single-worker execution as compatibility requirements.

The 1618 correction merge is chronology evidence. Its dependency setup was
unavailable in the original checkout. The rerun executes its unchanged assertion
at 59f74e1, the first available installed corrected state containing that test;
results.json records that execution ref.

## Re-running the published-package comparison

    mkdir -p /absolute/disposable/packs /absolute/disposable/consumer-211 /absolute/disposable/consumer-212
    npm pack counterfact@2.11.0 --pack-destination /absolute/disposable/packs
    npm pack counterfact@2.12.0 --pack-destination /absolute/disposable/packs
    shasum -a 256 /absolute/disposable/packs/counterfact-2.11.0.tgz /absolute/disposable/packs/counterfact-2.12.0.tgz
    node site/study/2026/experiments/assert-packaging-lifecycle.mjs /absolute/disposable/packs/counterfact-2.11.0.tgz /absolute/disposable/packs/counterfact-2.12.0.tgz
    cd /absolute/disposable/consumer-211 && npm init -y && npm install --foreground-scripts --loglevel=notice ../packs/counterfact-2.11.0.tgz
    cd /absolute/disposable/consumer-212 && npm init -y && npm install --foreground-scripts --loglevel=notice ../packs/counterfact-2.12.0.tgz

The assertion checks the lifecycle condition: 2.11.0 publishes a postinstall
patch-package hook while publishing no patch files; 2.12.0 publishes neither.
The archived run observed 2.11.0's No patch files found message and exit zero;
it does not claim an installation failure.
