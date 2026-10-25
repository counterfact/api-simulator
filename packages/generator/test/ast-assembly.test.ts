import { describe, expect, it } from "@jest/globals";
import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import { stringType } from "../src/ast.js";
import { Repository } from "../src/repository.js";
import { Requirement } from "../src/requirement.js";
import { SchemaTypeCoder } from "../src/schema-type-coder.js";
import { Specification } from "../src/specification.js";
import { TypeCoder } from "../src/type-coder.js";

describe("AST module assembly", () => {
  it("aliases colliding imports to their actual exported names", async () => {
    await usingTemporaryFiles(async ($) => {
      class ModelCoder extends TypeCoder {
        *names() {
          yield "Model";
          yield "Model2";
        }
        modulePath() {
          return this.requirement.url;
        }
        writeCode() {
          return stringType();
        }
      }
      const repository = new Repository();
      const script = repository.get("types/consumer.ts");
      expect(
        script.importType(
          new ModelCoder(new Requirement({}, "types/first.ts")),
        ),
      ).toBe("Model");
      expect(
        script.importType(
          new ModelCoder(new Requirement({}, "types/second.ts")),
        ),
      ).toBe("Model2");
      await repository.finished();
      for (const [path, module] of repository.scripts)
        await $.add(path, await module.contents());
      const consumer = await $.read("types/consumer.ts");
      expect(consumer).toContain("Model as Model2");
      const program = ts.createProgram([$.path("types/consumer.ts")], {
        strict: true,
        noEmit: true,
        types: [],
        skipLibCheck: true,
      });
      expect(
        ts
          .getPreEmitDiagnostics(program)
          .map((diagnostic) =>
            ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
          ),
      ).toEqual([]);
    });
  });

  it("uses a local type reference for structural recursion", async () => {
    await usingTemporaryFiles(async ($) => {
      const specification = new Specification();
      specification.rootRequirement = new Requirement(
        {
          components: {
            schemas: {
              Tree: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  children: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Tree" },
                  },
                },
              },
            },
          },
        },
        "#",
        specification,
      );
      const repository = new Repository();
      repository
        .get("types/components/schemas/Tree.ts")
        .exportType(
          new SchemaTypeCoder(
            new Requirement(
              { $ref: "#/components/schemas/Tree" },
              "#/tree",
              specification,
            ),
          ),
        );
      await repository.finished();
      const source = await repository
        .get("types/components/schemas/Tree.ts")
        .contents();
      expect(source).not.toContain("import");
      expect(source).toContain("children?: Array<Tree>");
      await $.add("tree.ts", source);
      const program = ts.createProgram([$.path("tree.ts")], {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
      });
      expect(
        ts
          .getPreEmitDiagnostics(program)
          .map((diagnostic) =>
            ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
          ),
      ).toEqual([]);
    });
  });
});
