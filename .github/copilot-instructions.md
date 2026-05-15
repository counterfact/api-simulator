# Copilot Instructions for Counterfact

## Manual Acceptance Tests

Every PR description must include a section titled exactly `## Manual acceptance tests` with 3–6 unchecked checkboxes. Each checkbox must describe an observable behavior (not an implementation detail), and must not be pre-checked — they are for the human reviewer.

- Cover the main success path, at least one edge case, and one regression check where applicable.
- Example:
  - [ ] `GET /hello/{name}` returns 200 with expected response body
  - [ ] Invalid example name returns 500
  - [ ] Existing routes without examples behave unchanged

**Exception:** When the PR only adds issue proposal files under `.github/issue-proposals/`, the acceptance tests section may be omitted. The CI workflow processes proposal files automatically on merge.

## File System Operations in Tests

When tests need to read or write files, use `usingTemporaryFiles()` from the `using-temporary-files` package (already a devDependency). Never import `node:fs`, `fs`, `node:fs/promises`, or `fs/promises` directly in test files.

The `$` helper provides:
- `$.add(relativePath, contents)` — create or overwrite a file
- `$.addDirectory(relativePath)` — create a directory
- `$.read(relativePath)` — read a file's contents (returns `Promise<string>`)
- `$.remove(relativePath)` — delete a file
- `$.path(relativePath)` — resolve an absolute path within the temporary directory (use this when passing paths to the code under test)

```ts
import { usingTemporaryFiles } from "using-temporary-files";

it("example", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("input.json", JSON.stringify({ key: "value" }));
    const result = await myFunction($.path("input.json"));
    const output = await $.read("output.txt");
    expect(output).toBe("expected content");
  });
});
```

## Before Committing

- Before running any other `yarn` command, run `yarn install` first. In CI-like environments (or when you need a reproducible install), use `yarn install --frozen-lockfile`.
- Run `yarn lint:fix` to auto-fix linting issues, then `yarn lint` to confirm no remaining errors.
- For any user-facing change, you **must**:
  - Add a changeset by running `npx changeset`. Choose the appropriate semver bump (patch / minor / major) and write a short description of what changed.
  - Update the relevant docs under `docs/` (e.g. `docs/usage.md`, `docs/getting-started.md`, or `docs/reference.md`) to reflect the change. If the change introduces a new feature or modifies existing behaviour, document it there.
- When touching server startup or CLI behaviour, run the black-box tests: `yarn build` then `yarn test:black-box` (requires Python 3 with `pip install -r test-black-box/requirements.txt`).

## Decision and Learning Log (when changing code)

For every non-trivial code change, keep a short running log:

- If a PR is being updated, add or update a `## Decision and learning log` section in the PR description.
- If there is no PR description context, include the same section in the final handoff message.

Include:

- Key decisions made and why those options were chosen.
- Incorrect assumptions or alternative approaches that were revised during the task.
- What instruction wording, missing context, or examples would have made the task clearer.
- Lessons learned from code review feedback, including what changed after review and what to do differently next time.

Keep entries concise, concrete, and tied to observable outcomes in the task.

## Context

Counterfact is a TypeScript-based mock server generator that transforms OpenAPI/Swagger specifications into live, stateful mock APIs with hot reload, a terminal REPL, and a built-in Swagger UI. Developers run it with a single command and receive fully typed route-handler files they can edit while the server is running.

```bash
npx counterfact@latest https://petstore3.swagger.io/api/v3/openapi.json api
```

## Repository Structure

```
src/
  app.ts                      # Main entry point; orchestrates generation, server startup, and REPL
  server/                     # Koa-based HTTP server, dispatcher, registry, hot-reload logic
  typescript-generator/       # Parses OpenAPI specs and emits TypeScript route/type files
  counterfact-types/          # Public API types exposed to route-handler authors
  repl/                       # Interactive terminal for inspecting/modifying server state at runtime
  migrate/                    # Helpers for updating existing route files when the spec changes
  client/                     # Handlebars HTML templates for the built-in dashboard/docs pages
  util/                       # Shared utility functions
bin/
  counterfact.js              # CLI entry point (commander-based)
test/                         # Jest unit tests
test-black-box/               # Python black-box integration tests (pytest)
templates/                    # Scaffold templates used during code generation
```

## Essential Commands

| Task                          | Command                          |
| ----------------------------- | -------------------------------- |
| Install dependencies          | `yarn install --frozen-lockfile` |
| Build                         | `yarn build`                     |
| Unit tests                    | `yarn test`                      |
| Black-box (integration) tests | `yarn test:black-box`            |
| TypeScript type tests         | `yarn build && yarn test:tsd`    |
| Lint (check)                  | `yarn lint`                      |
| Lint (auto-fix)               | `yarn lint:fix`                  |
| Run against Petstore          | `yarn go:petstore`               |

## Proposing New GitHub Issues

When planning work that requires new GitHub issues, follow the conventions in:

```
.github/instructions/issue-proposals.instructions.md
```

Key rules:

- **Never** create GitHub issues directly via the API, browser automation, or any other means.
- **Always** propose new issues as Markdown files under `.github/issue-proposals/`.
- Use YAML front matter for metadata (`title`, `parentIssue`, `labels`, `assignees`, `milestone`).
- Include `parentIssue` in front matter whenever you know the parent issue number.
- Write clear issue bodies with a summary, context/motivation, and acceptance criteria.

Proposal files are merged via a pull request and converted into real issues automatically on merge.
