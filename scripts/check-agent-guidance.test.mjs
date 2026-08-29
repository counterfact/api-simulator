import assert from "node:assert/strict";
import test from "node:test";

import { usingTemporaryFiles } from "using-temporary-files";

import {
  globToRegularExpression,
  parseApplyTo,
  parseInspectFirstPaths,
  parseLocalMarkdownLinks,
  validateAgentGuidance,
} from "./check-agent-guidance.mjs";

const VALID_SKILL = `---
name: example
description: Example skill.
applyTo:
  - "packages/example/src/**/*.ts"
---

# Example

## Files to inspect first

- \`packages/example/README.md\`

## How to validate the change

- Run \`yarn test\`.
`;

async function addValidRepository($) {
  await $.add(
    "package.json",
    `${JSON.stringify({ scripts: { test: "node --test" } })}\n`,
  );
  await $.add("AGENTS.md", "- `.github/skills/example/SKILL.md`\n");
  await $.add(".github/skills/example/SKILL.md", VALID_SKILL);
  await $.add(
    ".github/pull_request_template.md",
    "## Manual acceptance tests\n\n## Repository learning check\n",
  );
  await $.add("packages/example/README.md", "# Example\n");
  await $.add("README.md", "[`example`](./packages/example/README.md)\n");
  await $.add("packages/example/src/index.ts", "export {};\n");
}

test("matches the skill glob forms used by the repository", () => {
  assert.equal(
    globToRegularExpression("packages/*/src/**/*.ts").test(
      "packages/runtime/src/server/dispatcher.ts",
    ),
    true,
  );
  assert.equal(
    globToRegularExpression("packages/*/src/**/*.ts").test(
      "packages/runtime/test/dispatcher.test.ts",
    ),
    false,
  );
});

test("parses applicability and inspect-first paths", () => {
  assert.deepEqual(parseApplyTo(VALID_SKILL), ["packages/example/src/**/*.ts"]);
  assert.deepEqual(parseInspectFirstPaths(VALID_SKILL), [
    "packages/example/README.md",
  ]);
  assert.deepEqual(
    parseLocalMarkdownLinks(
      "[local](./local.md) [anchor](#here) [remote](https://example.com)",
    ),
    ["./local.md"],
  );
});

test("accepts consistent repository guidance", async () => {
  await usingTemporaryFiles(async ($) => {
    await addValidRepository($);
    assert.deepEqual(await validateAgentGuidance($.path(".")), []);
  });
});

test("reports stale paths, patterns, commands, links, and templates", async () => {
  await usingTemporaryFiles(async ($) => {
    await addValidRepository($);
    await $.add(
      ".github/skills/example/SKILL.md",
      VALID_SKILL.replace(
        '  - "packages/example/src/**/*.ts"',
        '  - "packages/missing/**/*.ts"',
      )
        .replace("packages/example/README.md", "packages/missing/README.md")
        .replace("yarn test", "yarn missing:script"),
    );
    await $.add(
      ".github/pull_request_template.md",
      "## Manual acceptance tests\n",
    );
    await $.add(
      "CONTRIBUTING.md",
      "[Missing contribution guide](./docs/missing.md)\n",
    );

    const errors = await validateAgentGuidance($.path("."));
    assert.ok(errors.some((error) => error.includes("matches no files")));
    assert.ok(errors.some((error) => error.includes("does not exist")));
    assert.ok(
      errors.some((error) => error.includes("unknown root Yarn command")),
    );
    assert.ok(
      errors.some((error) => error.includes("Repository learning check")),
    );
    assert.ok(
      errors.some((error) => error.includes("local link does not exist")),
    );
  });
});
