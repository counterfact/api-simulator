import { describe, expect, it } from "@jest/globals";
import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import { CodeGenerator } from "../src/code-generator.js";
import type { SchemaTypeOptions } from "../src/type-options.js";

type Files = Parameters<Parameters<typeof usingTemporaryFiles>[0]>[0];

const SPEC = {
  openapi: "3.1.0",
  info: { title: "Payments", version: "1" },
  paths: {
    "/payments": {
      post: {
        operationId: "createPayment",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Payment" },
            },
          },
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Payment" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Method: {
        type: "integer",
        enum: [0, 1, 2],
        "x-enumNames": ["None", "OutOfBand", "Secure Token"],
      },
      Status: {
        type: "string",
        enum: ["active", "closed"],
        "x-enum-varnames": ["Active", "Closed"],
      },
      Plain: { type: "string", enum: ["a", "b"] },
      Payment: {
        type: "object",
        required: ["code", "method"],
        properties: {
          code: { type: "string", minLength: 1, maxLength: 8 },
          method: { $ref: "#/components/schemas/Method" },
          status: { $ref: "#/components/schemas/Status" },
          plain: { $ref: "#/components/schemas/Plain" },
          memo: { type: "string", nullable: true },
          note: { type: ["string", "null"] },
        },
      },
      AuditedPayment: {
        allOf: [
          { $ref: "#/components/schemas/Payment" },
          { type: "object", properties: { auditor: { type: "string" } } },
        ],
      },
    },
  },
};

async function generate($: Files, typeOptions?: SchemaTypeOptions) {
  await $.add("spec.json", JSON.stringify(SPEC));
  await new CodeGenerator($.path("spec.json"), $.path("api"), {
    types: true,
    client: { typeSuffix: "Dto" },
    typeOptions,
  }).generate();
}

function schema($: Files, name: string): Promise<string> {
  return $.read(`api/types/components/schemas/${name}.ts`);
}

/** Strictly compiles `files`, as an application consuming the client would. */
function diagnostics(...files: string[]): string[] {
  const program = ts.createProgram(files, {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  });
  return ts
    .getPreEmitDiagnostics(program)
    .map(
      (diagnostic) =>
        `${diagnostic.file?.fileName ?? ""}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
    );
}

describe("schema type options", () => {
  it("keeps the standard declarations by default", async () => {
    await usingTemporaryFiles(async ($) => {
      await generate($);

      expect(await schema($, "Method")).toContain(
        "export type Method = 0 | 1 | 2;",
      );
      const payment = await schema($, "Payment");
      expect(payment).toContain("export type Payment = {");
      expect(payment).toContain("memo?: string | null;");
      expect(payment).toContain("note?: string | null;");
      expect(payment).not.toContain("@minLength");
      expect(await $.read("api/client/index.ts")).toContain(
        'export type * from "./data-contracts.js";',
      );
    });
  });

  it("declares named enums as TypeScript enums and re-exports them from the client", async () => {
    await usingTemporaryFiles(async ($) => {
      await generate($, { enumStyle: "enum" });

      expect(await schema($, "Method")).toContain(
        'export enum Method {\n  None = 0,\n  OutOfBand = 1,\n  "Secure Token" = 2,\n}',
      );
      expect(await schema($, "Status")).toContain(
        'export enum Status {\n  Active = "active",\n  Closed = "closed",\n}',
      );
      // Enums without member names remain unions.
      expect(await schema($, "Plain")).toContain(
        'export type Plain = "a" | "b";',
      );

      const contracts = await $.read("api/client/data-contracts.ts");
      expect(contracts).toContain(
        'export { Method as MethodDto } from "../types/components/schemas/Method.js";',
      );
      expect(contracts).toContain('export type PlainDto = Schemas["Plain"];');
      expect(await $.read("api/client/index.ts")).toContain(
        'export * from "./data-contracts.js";',
      );

      await $.add(
        "consumer.ts",
        `
        import { Api, MethodDto, StatusDto } from "./api/client/index.js";

        export async function consume(api: Api): Promise<boolean> {
          const payment = (
            await api.payments.createPayment({
              code: "A1",
              method: MethodDto.OutOfBand,
              status: StatusDto.Closed,
            })
          ).data;
          return payment.method === MethodDto.None;
        }
        `,
      );
      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
    });
  });

  it("declares named enums as const objects with a matching type", async () => {
    await usingTemporaryFiles(async ($) => {
      await generate($, { enumStyle: "const" });

      expect(await schema($, "Status")).toContain(
        'export const Status = {\n  Active: "active",\n  Closed: "closed",\n} as const;\nexport type Status = (typeof Status)[keyof typeof Status];',
      );

      await $.add(
        "consumer.ts",
        `
        import { StatusDto, type PaymentDto } from "./api/client/index.js";

        export const payment: PaymentDto = {
          code: "A1",
          method: 2,
          status: StatusDto.Active,
        };
        `,
      );
      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
    });
  });

  it("omits null, declares interfaces and documents constraints when asked", async () => {
    await usingTemporaryFiles(async ($) => {
      await generate($, {
        ignoreNullable: true,
        preferInterfaces: true,
        validationJsDoc: true,
      });

      const payment = await schema($, "Payment");
      expect(payment).toContain("export interface Payment {");
      expect(payment).toContain(
        "  /**\n   * @minLength 1\n   * @maxLength 8\n   */\n  code: string;",
      );
      expect(payment).toContain("memo?: string;");
      expect(payment).toContain("note?: string;");
      // Compositions are not plain object types, so they stay type aliases.
      expect(await schema($, "AuditedPayment")).toContain(
        "export type AuditedPayment = Payment &",
      );
    });
  });

  it("applies to schema-only generation", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("spec.json", JSON.stringify(SPEC));
      await new CodeGenerator($.path("spec.json"), $.path("schemas"), {
        typeOptions: { enumStyle: "enum", preferInterfaces: true },
      }).generateSchemas();

      expect(await $.read("schemas/Method.ts")).toContain("export enum Method");
      expect(await $.read("schemas/Payment.ts")).toContain(
        "export interface Payment {",
      );
    });
  });
});
