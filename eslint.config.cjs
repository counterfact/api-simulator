"use strict";

const fs = require("fs");
const Module = require("module");
const path = require("path");

function resolveCompatibleTypeScriptPath() {
  try {
    // precinct still installs a TypeScript 6 copy that matches the current
    // typescript-eslint peer range, so prefer that compiler for parser internals
    // until the eslint stack natively supports TypeScript 7.
    return require.resolve("typescript", {
      paths: [path.join(__dirname, "node_modules", "precinct", "node_modules")],
    });
  } catch {
    return undefined;
  }
}

const compatibleTypeScriptPath = resolveCompatibleTypeScriptPath();
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, ...rest) {
  if (
    request === "typescript" &&
    compatibleTypeScriptPath !== undefined &&
    fs.existsSync(compatibleTypeScriptPath) &&
    ["/@typescript-eslint/", "/ts-api-utils/"].some((segment) =>
      parent?.filename?.includes(segment.replaceAll("/", path.sep)),
    )
  ) {
    return compatibleTypeScriptPath;
  }

  return originalResolveFilename.call(this, request, parent, ...rest);
};

const js = require("@eslint/js");
const prettierPlugin = require("eslint-plugin-prettier");
const typescriptParser = require("@typescript-eslint/parser");
const typescriptPlugin = require("@typescript-eslint/eslint-plugin");
const jestPlugin = require("eslint-plugin-jest");
const nPluginImport = require("eslint-plugin-n");
const nPlugin = nPluginImport.default ?? nPluginImport;
const promisePlugin = require("eslint-plugin-promise");
const importPlugin = require("eslint-plugin-import");
const regexpPlugin = require("eslint-plugin-regexp");
const securityPlugin = require("eslint-plugin-security");
const espreeParser = require("espree");

const DASH_CHAR_CODE = 45;
const DIGIT_START_CHAR_CODE = 48;
const DIGIT_END_CHAR_CODE = 57;
const LOWERCASE_A_CHAR_CODE = 97;
const LOWERCASE_Z_CHAR_CODE = 122;

function isKebabCase(name) {
  if (name.length === 0) return false;

  let previousCharacterWasDash = false;
  for (let index = 0; index < name.length; index += 1) {
    const charCode = name.charCodeAt(index);

    if (charCode === DASH_CHAR_CODE) {
      if (index === 0 || previousCharacterWasDash) return false;
      previousCharacterWasDash = true;
      continue;
    }

    const isDigit =
      charCode >= DIGIT_START_CHAR_CODE && charCode <= DIGIT_END_CHAR_CODE;
    const isLowercaseLetter =
      charCode >= LOWERCASE_A_CHAR_CODE && charCode <= LOWERCASE_Z_CHAR_CODE;

    if (!isDigit && !isLowercaseLetter) return false;
    previousCharacterWasDash = false;
  }

  return !previousCharacterWasDash;
}

const jestRecommended = jestPlugin.configs["flat/recommended"];
const typescriptFiles = ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"];
const typescriptRecommended = typescriptPlugin.configs["flat/recommended"].map(
  (config) => ({
    ...config,
    files: typescriptFiles,
  }),
);

module.exports = [
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "reports/**",
      "out/**",
      "dist/**",
      "_includes",
      ".yarn/**",
      "jest.config.js",
      ".eslintrc.cjs",
    ],
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
  js.configs.recommended,
  ...nPlugin.configs["flat/mixed-esm-and-cjs"],
  promisePlugin.configs["flat/recommended"],
  importPlugin.flatConfigs.recommended,
  regexpPlugin.configs["flat/recommended"],
  securityPlugin.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
  ...typescriptRecommended,
  {
    files: typescriptFiles,
    plugins: {
      n: nPlugin,
    },
    languageOptions: {
      parser: typescriptParser,
    },
  },
  {
    files: typescriptFiles,
    ...importPlugin.flatConfigs.typescript,
  },
  {
    files: ["*.cjs"],
    rules: {
      "import/no-commonjs": "off",
    },
  },
  {
    files: ["**/*.{js,cjs,mjs}"],
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      "import/no-extraneous-dependencies": "off",
      "promise/avoid-new": "off",
      "regexp/prefer-named-capture-group": "warn",
      "security/detect-non-literal-require": "error",
      "prettier/prettier": [
        "error",
        {
          endOfLine: "auto",
        },
      ],
    },
  },
  {
    files: ["**/*.test.js", "**/*.test.ts"],
    plugins: jestRecommended.plugins,
    languageOptions: {
      ...jestRecommended.languageOptions,
      parser: typescriptParser,
    },
    rules: {
      ...jestRecommended.rules,
      "@typescript-eslint/naming-convention": "off",
      "@typescript-eslint/no-shadow": "off",
      "id-length": "off",
      "import/no-extraneous-dependencies": "off",
      "import/no-named-as-default-member": "off",
      "import/unambiguous": "off",
      "jest/no-conditional-in-test": "warn",
      "jest/prefer-expect-assertions": "off",
      "jest/unbound-method": "off",
      "max-lines": "off",
      "new-cap": ["error", { capIsNewExceptionPattern: "GET|PUT|POST|DELETE" }],
      "no-magic-numbers": "off",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "fs",
              message:
                "Do not import 'fs' in tests. Use usingTemporaryFiles() from 'using-temporary-files' instead.",
            },
            {
              name: "node:fs",
              message:
                "Do not import 'node:fs' in tests. Use usingTemporaryFiles() from 'using-temporary-files' instead.",
            },
            {
              name: "fs/promises",
              message:
                "Do not import 'fs/promises' in tests. Use usingTemporaryFiles() from 'using-temporary-files' instead.",
            },
            {
              name: "node:fs/promises",
              message:
                "Do not import 'node:fs/promises' in tests. Use usingTemporaryFiles() from 'using-temporary-files' instead.",
            },
          ],
        },
      ],
      "no-shadow": "off",
    },
  },
  {
    files: ["demo/**/*.js"],
    rules: {
      "import/no-extraneous-dependencies": "off",
      "import/prefer-default-export": "off",
      "no-console": "off",
      "no-param-reassign": "off",
    },
  },
  {
    files: typescriptFiles,
    ignores: ["dist/**", "out/**"],
    rules: {
      "@typescript-eslint/lines-around-comment": "off",
      "@typescript-eslint/naming-convention": "off",
      "@typescript-eslint/no-magic-numbers": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/prefer-readonly-parameter-types": "off",
      camelcase: "off",
      "eslint-comments/no-unused-disable": "off",
      "etc/prefer-interface": "off",
      "func-style": "off",
      "import/extensions": "off",
      "import/group-exports": "off",
      "import/no-extraneous-dependencies": "off",
      "import/no-unresolved": "off",
      "import/prefer-default-export": "off",
      "max-len": "off",
      "no-magic-numbers": "off",
      "no-param-reassign": "off",
      "promise/avoid-new": "off",
      "regexp/prefer-named-capture-group": "warn",
      "security/detect-non-literal-require": "error",
    },
  },
  {
    files: [...typescriptFiles, "**/*.cjs"],
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      "prettier/prettier": [
        "error",
        {
          endOfLine: "auto",
        },
      ],
    },
  },
  {
    files: ["**/*.test-d.ts"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  {
    files: ["eslint.config.cjs"],
    languageOptions: {
      sourceType: "commonjs",
    },
    rules: {
      "import/no-commonjs": "off",
      "n/no-extraneous-require": "off",
    },
  },
  {
    files: ["jest.config.js"],
    languageOptions: {
      sourceType: "module",
    },
  },
  {
    files: ["templates/**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: typescriptParser,
    },
    rules: {},
  },
  {
    files: ["bin/**/*.js"],
    languageOptions: {
      ecmaVersion: 2025,
      sourceType: "module",
      parser: espreeParser,
    },
    rules: {
      "import/no-unresolved": "off",
      "n/no-missing-import": "off",
      "n/no-process-exit": "off",
    },
  },
  {
    files: [".yarn/releases/*.cjs"],
    rules: {
      "n/no-deprecated-api": "off",
    },
  },
  {
    files: ["src/**/*.{ts,tsx,js,cjs,mjs}", "test/**/*.{ts,tsx,js,cjs,mjs}"],
    plugins: {
      "filename-rules": {
        rules: {
          "kebab-case": {
            create(context) {
              return {
                Program() {
                  const filename = context.filename;
                  const basename = path
                    .basename(filename)
                    .replace(/\..*$/u, "");

                  if (!isKebabCase(basename)) {
                    context.report({
                      loc: { line: 1, column: 0 },
                      message: `Filename '${basename}' must be kebab-case.`,
                    });
                  }
                },
              };
            },
          },
        },
      },
    },
    rules: {
      "filename-rules/kebab-case": "error",
    },
  },
  // The site/ directory has its own package.json, tsconfig, and ESLint config;
  // exclude it from the root ESLint run entirely.
  { ignores: ["site/**"] },
];
