import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
// CI and the monorepo development toolchain use a current Node release.
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import test from "node:test";

import {
  extractModuleSpecifiers,
  validatePackageBoundaries,
} from "./check-package-boundaries.mjs";

async function createWorkspace(t, packageDefinitions) {
  const repositoryRoot = await mkdtemp(
    path.join(os.tmpdir(), "counterfact-boundaries-"),
  );
  t.after(() => rm(repositoryRoot, { force: true, recursive: true }));

  const directoryByName = new Map(
    packageDefinitions.map((definition) => [
      definition.name,
      definition.directory ?? definition.name.replace("@counterfact/", ""),
    ]),
  );

  for (const definition of packageDefinitions) {
    const directory = directoryByName.get(definition.name);
    const packageRoot = path.join(repositoryRoot, "packages", directory);
    await mkdir(path.join(packageRoot, "src"), { recursive: true });
    await writeFile(
      path.join(packageRoot, "package.json"),
      `${JSON.stringify(
        {
          dependencies: definition.dependencies,
          exports: definition.exports ?? { ".": "./dist/index.js" },
          name: definition.name,
          type: "module",
          version: "0.0.0",
        },
        undefined,
        2,
      )}\n`,
    );
    await writeFile(
      path.join(packageRoot, "tsconfig.json"),
      `${JSON.stringify(
        {
          references: (definition.references ?? []).map((name) => ({
            path: `../${directoryByName.get(name)}`,
          })),
        },
        undefined,
        2,
      )}\n`,
    );
    await writeFile(
      path.join(packageRoot, "src", "index.ts"),
      definition.source ?? "export {};\n",
    );
  }

  return repositoryRoot;
}

function assertHasError(errors, expected) {
  assert.ok(
    errors.some((error) => error.includes(expected)),
    `Expected an error containing ${JSON.stringify(expected)}. Received:\n${errors.join("\n")}`,
  );
}

test("extracts executable module specifiers without matching inert text", () => {
  const source = [
    '// import "@counterfact/comment";',
    '/* export * from "@counterfact/block-comment"; */',
    `const quoted = 'require("@counterfact/string")';`,
    'const template = `import("@counterfact/template")`;',
    String.raw`const matcher = /import\s+thing\s+from\s+["']@counterfact\/regex["']/u;`,
    'import "@counterfact/side-effect";',
    'import value from "@counterfact/static";',
    'export { value } from "@counterfact/reexport";',
    'export type { Value } from "@counterfact/type-reexport";',
    'const lazy = import("@counterfact/dynamic");',
    'const commonJs = require("@counterfact/require");',
  ].join("\n");

  assert.deepEqual(
    extractModuleSpecifiers(source).map(({ specifier }) => specifier),
    [
      "@counterfact/side-effect",
      "@counterfact/static",
      "@counterfact/reexport",
      "@counterfact/type-reexport",
      "@counterfact/dynamic",
      "@counterfact/require",
    ],
  );
});

test("accepts a package graph that follows the allowlist", async (t) => {
  const repositoryRoot = await createWorkspace(t, [
    { name: "@counterfact/types" },
    {
      dependencies: { "@counterfact/types": "workspace:*" },
      name: "@counterfact/runtime",
      references: ["@counterfact/types"],
      source: 'export { value } from "@counterfact/types";\n',
    },
  ]);
  const allowlist = {
    "@counterfact/runtime": ["@counterfact/types"],
    "@counterfact/types": [],
  };

  const { errors } = await validatePackageBoundaries(repositoryRoot, {
    allowlist,
  });

  assert.deepEqual(errors, []);
});

test("rejects a focused package import of the facade", async (t) => {
  const repositoryRoot = await createWorkspace(t, [
    { name: "counterfact" },
    {
      dependencies: { counterfact: "workspace:*" },
      name: "@counterfact/types",
      references: ["counterfact"],
      source: 'import "counterfact";\n',
    },
  ]);
  const allowlist = {
    "@counterfact/types": ["counterfact"],
    counterfact: [],
  };

  const { errors } = await validatePackageBoundaries(repositoryRoot, {
    allowlist,
  });

  assertHasError(errors, "focused package imports counterfact");
});

test("rejects cross-package private and deep imports", async (t) => {
  const repositoryRoot = await createWorkspace(t, [
    { name: "@counterfact/types" },
    {
      dependencies: { "@counterfact/types": "workspace:*" },
      name: "@counterfact/runtime",
      references: ["@counterfact/types"],
      source: 'import "@counterfact/types/private";\n',
    },
  ]);
  const allowlist = {
    "@counterfact/runtime": ["@counterfact/types"],
    "@counterfact/types": [],
  };

  const { errors } = await validatePackageBoundaries(repositoryRoot, {
    allowlist,
  });

  assertHasError(errors, "private/deep import is not exported");
});

test("rejects internal imports without a production dependency", async (t) => {
  const repositoryRoot = await createWorkspace(t, [
    { name: "@counterfact/types" },
    {
      name: "@counterfact/runtime",
      source: 'import "@counterfact/types";\n',
    },
  ]);
  const allowlist = {
    "@counterfact/runtime": ["@counterfact/types"],
    "@counterfact/types": [],
  };

  const { errors } = await validatePackageBoundaries(repositoryRoot, {
    allowlist,
  });

  assertHasError(
    errors,
    "import of @counterfact/types is missing a production dependency",
  );
});

test("rejects a dependency direction outside the allowlist", async (t) => {
  const repositoryRoot = await createWorkspace(t, [
    {
      dependencies: { "@counterfact/runtime": "workspace:*" },
      name: "@counterfact/types",
      references: ["@counterfact/runtime"],
    },
    { name: "@counterfact/runtime" },
  ]);
  const allowlist = {
    "@counterfact/runtime": [],
    "@counterfact/types": [],
  };

  const { errors } = await validatePackageBoundaries(repositoryRoot, {
    allowlist,
  });

  assertHasError(errors, "disallowed dependency on @counterfact/runtime");
});

test("requires production dependencies and tsconfig references to match", async (t) => {
  const repositoryRoot = await createWorkspace(t, [
    { name: "@counterfact/types" },
    {
      dependencies: { "@counterfact/types": "workspace:*" },
      name: "@counterfact/runtime",
    },
    {
      name: "@counterfact/client",
      references: ["@counterfact/types"],
    },
  ]);
  const allowlist = {
    "@counterfact/client": [],
    "@counterfact/runtime": ["@counterfact/types"],
    "@counterfact/types": [],
  };

  const { errors } = await validatePackageBoundaries(repositoryRoot, {
    allowlist,
  });

  assertHasError(
    errors,
    "production dependency @counterfact/types is missing from tsconfig references",
  );
  assertHasError(
    errors,
    "tsconfig references @counterfact/types without a production dependency",
  );
});

test("rejects relative imports that escape a package root", async (t) => {
  const repositoryRoot = await createWorkspace(t, [
    { name: "@counterfact/types" },
    {
      name: "@counterfact/runtime",
      source: 'import "../../types/src/index.js";\n',
    },
  ]);
  const allowlist = {
    "@counterfact/runtime": [],
    "@counterfact/types": [],
  };

  const { errors } = await validatePackageBoundaries(repositoryRoot, {
    allowlist,
  });

  assertHasError(errors, "relative import escapes package root");
});

test("rejects cycles in the production dependency graph", async (t) => {
  const repositoryRoot = await createWorkspace(t, [
    {
      dependencies: { "@counterfact/b": "workspace:*" },
      name: "@counterfact/a",
      references: ["@counterfact/b"],
    },
    {
      dependencies: { "@counterfact/a": "workspace:*" },
      name: "@counterfact/b",
      references: ["@counterfact/a"],
    },
  ]);
  const allowlist = {
    "@counterfact/a": ["@counterfact/b"],
    "@counterfact/b": ["@counterfact/a"],
  };

  const { errors } = await validatePackageBoundaries(repositoryRoot, {
    allowlist,
  });

  assertHasError(
    errors,
    "Counterfact package dependency cycle: @counterfact/a -> @counterfact/b -> @counterfact/a",
  );
});
