import assert from "node:assert/strict";
import path from "node:path";
// CI and the monorepo development toolchain use a current Node release.

import test from "node:test";
import { usingTemporaryFiles } from "using-temporary-files";

import {
  extractModuleSpecifiers,
  validatePackageBoundaries,
} from "./check-package-boundaries.mjs";

function workspaceTest(name, run) {
  test(name, () => usingTemporaryFiles(run));
}

async function createWorkspace($, packageDefinitions) {
  const repositoryRoot = $.path(".");

  const directoryByName = new Map(
    packageDefinitions.map((definition) => [
      definition.name,
      definition.directory ?? definition.name.replace("@counterfact/", ""),
    ]),
  );

  for (const definition of packageDefinitions) {
    const directory = directoryByName.get(definition.name);
    const packageRoot = path.join("packages", directory);
    await $.addDirectory(path.join(packageRoot, "src"));
    await $.add(
      path.join(packageRoot, "package.json"),
      `${JSON.stringify(
        {
          dependencies: definition.dependencies,
          exports:
            definition.exports === undefined
              ? { ".": "./dist/index.js" }
              : definition.exports,
          name: definition.name,
          type: "module",
          version: "0.0.0",
        },
        undefined,
        2,
      )}\n`,
    );
    await $.add(
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
    await $.add(
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

workspaceTest(
  "accepts a package graph that follows the allowlist",
  async ($) => {
    const repositoryRoot = await createWorkspace($, [
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
  },
);

workspaceTest("rejects a focused package import of the facade", async ($) => {
  const repositoryRoot = await createWorkspace($, [
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

workspaceTest("rejects cross-package private and deep imports", async ($) => {
  const repositoryRoot = await createWorkspace($, [
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

workspaceTest(
  "rejects internal imports without a production dependency",
  async ($) => {
    const repositoryRoot = await createWorkspace($, [
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
  },
);

workspaceTest(
  "rejects a dependency direction outside the allowlist",
  async ($) => {
    const repositoryRoot = await createWorkspace($, [
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
  },
);

workspaceTest(
  "requires production dependencies and tsconfig references to match",
  async ($) => {
    const repositoryRoot = await createWorkspace($, [
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
  },
);

workspaceTest(
  "rejects relative imports that escape a package root",
  async ($) => {
    const repositoryRoot = await createWorkspace($, [
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
  },
);

workspaceTest(
  "rejects cycles in the production dependency graph",
  async ($) => {
    const repositoryRoot = await createWorkspace($, [
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
  },
);

test("parses literal imports throughout executable syntax", () => {
  const source = [
    "const lazy = import(`@counterfact/template`);",
    'const message = `${require("@counterfact/interpolation")}`;',
    String.raw`import "\x40counterfact/escaped";`,
    'import Legacy = require("@counterfact/legacy");',
    'type Value = import("@counterfact/type").Value;',
    'const view = <div>{import("@counterfact/jsx")}</div>;',
    'registry.require("@counterfact/not-a-module");',
    "const computed = import(packageName);",
    "const template = import(`@counterfact/${name}`);",
  ].join("\n");
  assert.deepEqual(extractModuleSpecifiers(source, "source.tsx"), [
    { line: 1, specifier: "@counterfact/template" },
    { line: 2, specifier: "@counterfact/interpolation" },
    { line: 3, specifier: "@counterfact/escaped" },
    { line: 4, specifier: "@counterfact/legacy" },
    { line: 5, specifier: "@counterfact/type" },
    { line: 6, specifier: "@counterfact/jsx" },
  ]);
});

for (const { name, exports, subpath, allowed } of [
  {
    name: "string root",
    exports: "./dist/index.js",
    subpath: "",
    allowed: true,
  },
  {
    name: "conditional root",
    exports: { types: "./dist/index.d.ts", import: "./dist/index.js" },
    subpath: "",
    allowed: true,
  },
  { name: "null root", exports: null, subpath: "", allowed: false },
  {
    name: "array fallback",
    exports: [null, "./dist/index.js"],
    subpath: "",
    allowed: true,
  },
  {
    name: "explicit null overrides wildcard",
    exports: { "./*": "./dist/*.js", "./private": null },
    subpath: "/private",
    allowed: false,
  },
  {
    name: "private wildcard overrides public wildcard",
    exports: { "./*": "./dist/*.js", "./private/*": null },
    subpath: "/private/secret",
    allowed: false,
  },
  {
    name: "specific suffix overrides broad wildcard",
    exports: { "./features/*": "./dist/*.js", "./features/*.internal": null },
    subpath: "/features/secret.internal",
    allowed: false,
  },
  {
    name: "public wildcard",
    exports: { "./*": "./dist/*.js", "./private/*": null },
    subpath: "/public",
    allowed: true,
  },
  {
    name: "exact export overrides blocked wildcard",
    exports: { "./private/*": null, "./private/public": "./dist/public.js" },
    subpath: "/private/public",
    allowed: true,
  },
  {
    name: "null conditional target",
    exports: { "./private": { import: null, default: null } },
    subpath: "/private",
    allowed: false,
  },
]) {
  workspaceTest(`respects ${name} exports`, async ($) => {
    const repositoryRoot = await createWorkspace($, [
      { name: "@counterfact/types", exports },
      {
        name: "@counterfact/runtime",
        dependencies: { "@counterfact/types": "workspace:*" },
        references: ["@counterfact/types"],
        source: `import "@counterfact/types${subpath}";`,
      },
    ]);
    const { errors } = await validatePackageBoundaries(repositoryRoot, {
      allowlist: {
        "@counterfact/types": [],
        "@counterfact/runtime": ["@counterfact/types"],
      },
    });
    if (allowed) assert.deepEqual(errors, []);
    else {
      assert.equal(errors.length, 1);
      assertHasError(errors, "private/deep import is not exported");
    }
  });
}

workspaceTest(
  "reads config comments and trailing commas without changing strings",
  async ($) => {
    const repositoryRoot = await createWorkspace($, [
      { name: "@counterfact/types", directory: "types,}" },
      {
        name: "@counterfact/runtime",
        dependencies: { "@counterfact/types": "workspace:*" },
      },
    ]);
    await $.add(
      "packages/runtime/tsconfig.json",
      `{
    // A legal directory name must survive JSONC parsing.
    "references": [{ "path": "../types,}", }],
  }`,
    );
    const { errors } = await validatePackageBoundaries(repositoryRoot, {
      allowlist: {
        "@counterfact/types": [],
        "@counterfact/runtime": ["@counterfact/types"],
      },
    });
    assert.deepEqual(errors, []);
  },
);

workspaceTest("reports malformed configuration", async ($) => {
  const repositoryRoot = await createWorkspace($, [
    { name: "@counterfact/types" },
  ]);
  await $.add("packages/types/tsconfig.json", '{ "references": [');
  const { errors } = await validatePackageBoundaries(repositoryRoot, {
    allowlist: { "@counterfact/types": [] },
  });
  assertHasError(errors, "cannot read tsconfig.json");
});

test("parses TypeScript generic arrows without treating them as JSX", () => {
  const source =
    'const identity = <T>(value: T) => value;\nimport "@counterfact/types";';
  assert.deepEqual(extractModuleSpecifiers(source, "source.ts"), [
    { line: 2, specifier: "@counterfact/types" },
  ]);
});
