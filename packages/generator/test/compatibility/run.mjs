import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import { CodeGenerator, schemaTypeCompatibility } from "../../dist/index.js";

const execute = promisify(execFile);
const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, "../../../..");

function descriptor(checker, type) {
  return checker
    .getPropertiesOfType(type)
    .map((symbol) => ({
      name: symbol.name,
      optional: Boolean(symbol.flags & ts.SymbolFlags.Optional),
      readonly:
        symbol.declarations?.some(
          (declaration) =>
            ts.canHaveModifiers(declaration) &&
            ts
              .getModifiers(declaration)
              ?.some(
                (modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword,
              ),
        ) ?? false,
      type: checker.typeToString(
        checker.getTypeOfSymbolAtLocation(symbol, symbol.declarations[0]),
      ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function runTarget(target, tool, specification) {
  await usingTemporaryFiles(async ($) => {
    const report = {
      target,
      version: tool.version,
      commands: [],
      comparisons: [],
      passed: false,
    };
    const output = path.relative(
      $.path("."),
      path.join(repository, "artifacts/generator-compatibility", target),
    );
    const run = async (command, args) => {
      report.commands.push({ command: path.basename(command), args });
      const result = await execute(command, args, {
        cwd: $.path("."),
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, CI: "true", NO_COLOR: "1" },
      });
      console.log(result.stdout);
      return result.stdout;
    };
    const toolScript = async (source) => {
      await $.add("tools/run.mjs", source);
      await run(process.execPath, [$.path("tools/run.mjs")]);
    };
    try {
      await $.add("spec.json", specification);
      await $.add("package.json", '{"private":true,"type":"module"}');
      await $.add("tools/package.json", '{"private":true,"type":"module"}');
      await $.addDirectory("upstream");
      if (tool.package) {
        await run("npm", [
          "install",
          "--prefix",
          $.path("tools"),
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          "--package-lock=false",
          `${tool.package}@${tool.version}`,
        ]);
        const installed = JSON.parse(
          await $.read(`tools/node_modules/${tool.package}/package.json`),
        );
        assert.equal(
          installed.version,
          tool.version,
          "The installed generator must match its pin",
        );
      }
      const input = $.path("spec.json");
      const upstream = $.path("upstream");
      let modelModule = "./upstream/models.js";
      switch (target) {
        case "openapi-typescript":
          await run($.path("tools/node_modules/.bin/openapi-typescript"), [
            input,
            "--output",
            $.path("upstream/models.ts"),
          ]);
          break;
        case "hey-api":
          await toolScript(`import { createClient } from "@hey-api/openapi-ts";
            await createClient({ input: ${JSON.stringify(input)}, output: ${JSON.stringify(upstream)}, plugins: ["@hey-api/typescript"] });`);
          modelModule = "./upstream/types.gen.js";
          break;
        case "orval":
          await toolScript(`import { generate } from "orval";
            await generate({ input: ${JSON.stringify(input)}, output: { target: ${JSON.stringify($.path("upstream/client.ts"))}, schemas: ${JSON.stringify($.path("upstream/models"))}, client: "fetch", mode: "single" } });`);
          modelModule = "./upstream/models/index.js";
          break;
        case "swagger-typescript-api":
          await toolScript(`import { generateApi } from "swagger-typescript-api";
            await generateApi({ input: ${JSON.stringify(input)}, output: ${JSON.stringify(upstream)}, name: "models.ts", generateClient: false, enumStyle: "union", addReadonly: false });`);
          break;
        case "openapi-typescript-codegen":
          await toolScript(`import { generate } from "openapi-typescript-codegen";
            await generate({ input: ${JSON.stringify(input)}, output: ${JSON.stringify(upstream)}, useUnionTypes: true, exportCore: false, exportServices: false, exportModels: true });`);
          modelModule = "./upstream/index.js";
          break;
        case "openapi-generator-fetch":
        case "openapi-generator-axios": {
          const jar = $.path("tools/generator.jar");
          await run("curl", [
            "--fail",
            "--location",
            "--retry",
            "3",
            "--output",
            jar,
            `https://repo.maven.apache.org/maven2/org/openapitools/openapi-generator-cli/${tool.version}/openapi-generator-cli-${tool.version}.jar`,
          ]);
          const version = await run("java", [
            "-jar",
            jar,
            "version",
            "--short",
          ]);
          assert.equal(version.trim(), tool.version);
          await run("java", [
            "-jar",
            jar,
            "generate",
            "-g",
            tool.generator,
            "-i",
            input,
            "-o",
            upstream,
            "--additional-properties",
            "modelPropertyNaming=original,stringEnums=false,hideGenerationTimestamp=true,withSeparateModelsAndApi=true,modelPackage=models,apiPackage=apis",
          ]);
          modelModule = "./upstream/models/index.js";
          break;
        }
        case "nswag": {
          await run("dotnet", [
            "tool",
            "install",
            "NSwag.ConsoleCore",
            "--version",
            tool.version,
            "--tool-path",
            $.path("tools/nswag"),
          ]);
          await run($.path("tools/nswag/nswag"), [
            "openapi2tsclient",
            `/input:${input}`,
            `/output:${$.path("upstream/models.ts")}`,
            "/GenerateClientClasses:false",
            "/GenerateDtoTypes:true",
            "/TypeStyle:Interface",
            "/EnumStyle:StringLiteral",
            "/NullValue:Null",
            "/DateTimeType:Date",
          ]);
          break;
        }
        default:
          throw new Error(`Unimplemented generator: ${target}`);
      }
      await new CodeGenerator(input, $.path("counterfact"), {
        routes: false,
        types: true,
        schemaTypeTransform: schemaTypeCompatibility(target),
      }).generate();
      const names = Object.keys(JSON.parse(specification).components.schemas);
      const aliases = names
        .map((name) => {
          const other =
            target === "openapi-typescript"
              ? `import(${JSON.stringify(modelModule)}).components["schemas"][${JSON.stringify(name)}]`
              : `import(${JSON.stringify(modelModule)}).${name}`;
          return `export type Ours${name} = import("./counterfact/types/components/schemas/${name}.js").${name};
          export type Theirs${name} = ${other};
          declare const ours${name}: Ours${name}; declare const theirs${name}: Theirs${name};
          export const toOther${name}: Theirs${name} = ours${name};
          export const toOurs${name}: Ours${name} = theirs${name};`;
        })
        .join("\n");
      await $.add("compare.ts", aliases);
      const program = ts.createProgram([$.path("compare.ts")], {
        strict: true,
        exactOptionalPropertyTypes: true,
        noEmit: true,
        skipLibCheck: false,
        types: [],
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      });
      const diagnostics = ts.getPreEmitDiagnostics(program);
      report.diagnostics = ts.formatDiagnosticsWithColorAndContext(
        diagnostics,
        {
          getCanonicalFileName: (name) => name,
          getCurrentDirectory: () => $.path("."),
          getNewLine: () => "\n",
        },
      );
      const checker = program.getTypeChecker();
      const source = program.getSourceFile($.path("compare.ts"));
      const exported = checker.getExportsOfModule(
        checker.getSymbolAtLocation(source),
      );
      for (const name of names) {
        const ours = checker.getDeclaredTypeOfSymbol(
          exported.find((symbol) => symbol.name === `Ours${name}`),
        );
        const theirs = checker.getDeclaredTypeOfSymbol(
          exported.find((symbol) => symbol.name === `Theirs${name}`),
        );
        const comparison = {
          model: name,
          ours: descriptor(checker, ours),
          theirs: descriptor(checker, theirs),
        };
        report.comparisons.push(comparison);
        assert.equal(
          Boolean(ours.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)),
          false,
          `${name}: Counterfact model resolved to any/unknown`,
        );
        assert.equal(
          Boolean(theirs.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)),
          false,
          `${name}: upstream model resolved to any/unknown`,
        );
        const fields = (properties) =>
          properties.map(({ name: field, optional, readonly }) => ({
            name: field,
            optional,
            readonly,
          }));
        assert.deepEqual(
          fields(comparison.ours),
          fields(comparison.theirs),
          `${name}: generated property names/optionality/readonly differ`,
        );
      }
      assert.equal(diagnostics.length, 0, report.diagnostics);
      await new CodeGenerator(input, $.path("counterfact-default"), {
        routes: false,
        types: true,
      }).generate();
      await $.add(
        "compare-control.ts",
        aliases.replaceAll("./counterfact/", "./counterfact-default/"),
      );
      const control = ts.createProgram(
        [$.path("compare-control.ts")],
        program.getCompilerOptions(),
      );
      const controlDiagnostics = ts.getPreEmitDiagnostics(control);
      assert.notEqual(
        controlDiagnostics.length,
        0,
        "Negative control: untransformed Counterfact types unexpectedly passed",
      );
      report.negativeControlRejected = true;
      report.passed = true;
      console.log(
        `${target}@${tool.version}: ${names.length} actual generated model pairs passed both assignment directions and property checks.`,
      );
    } catch (error) {
      report.error = error.stack;
      report.stdout = error.stdout;
      report.stderr = error.stderr;
      throw error;
    } finally {
      // Preserve the actual generator output and compiler consumer before cleanup.
      await $.add(`${output}/report.json`, JSON.stringify(report, null, 2));
      for (const file of ["spec.json", "compare.ts", "compare-control.ts"]) {
        try {
          await $.add(`${output}/${file}`, await $.read(file));
        } catch {
          /* The generator may have failed before this file was created. */
        }
      }
      // TypeScript discovers model imports without enumerating the filesystem.
      const capture = ts.createProgram(
        [$.path("compare.ts"), $.path("compare-control.ts")],
        {
          allowJs: false,
          noEmit: true,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          module: ts.ModuleKind.ESNext,
        },
      );
      for (const file of capture.getSourceFiles()) {
        const relative = path.relative($.path("."), file.fileName);
        if (
          relative.startsWith("upstream/") ||
          relative.startsWith("counterfact/") ||
          relative.startsWith("counterfact-default/")
        )
          await $.add(`${output}/${relative}`, file.text);
      }
    }
  });
}

await usingTemporaryFiles(async ($) => {
  const tools = JSON.parse(
    await $.read(
      path.relative($.path("."), path.join(directory, "tools.json")),
    ),
  );
  const specification = await $.read(
    path.relative($.path("."), path.join(directory, "specification.json")),
  );
  const selected = process.argv[2];
  if (selected === "--list") {
    console.log(Object.keys(tools).join("\n"));
    return;
  }
  if (selected && !Object.hasOwn(tools, selected))
    throw new Error(`Unknown target: ${selected}`);
  for (const target of selected ? [selected] : Object.keys(tools))
    await runTarget(target, tools[target], specification);
});
