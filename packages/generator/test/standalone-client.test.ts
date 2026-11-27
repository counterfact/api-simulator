import { describe, expect, it } from "@jest/globals";
import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import { CodeGenerator } from "../src/code-generator.js";

type Files = Parameters<Parameters<typeof usingTemporaryFiles>[0]>[0];

const SPEC = {
  openapi: "3.1.0",
  info: { title: "Accounts", version: "1" },
  paths: {
    "/accounts": {
      get: {
        operationId: "listAccounts",
        parameters: [
          { in: "query", name: "page", schema: { type: "integer" } },
          {
            in: "query",
            name: "status",
            required: true,
            schema: { $ref: "#/components/schemas/Status" },
          },
        ],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Account" },
                },
              },
            },
          },
        },
      },
      post: {
        operationId: "createAccount",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/new-account" },
            },
          },
        },
        responses: {
          201: {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Account" },
              },
            },
          },
          default: {
            description: "Error",
            content: {
              "application/problem+json": {
                schema: { $ref: "#/components/schemas/Problem" },
              },
            },
          },
        },
      },
    },
    "/accounts/{account-id}": {
      parameters: [
        {
          in: "path",
          name: "account-id",
          required: true,
          schema: { type: "integer" },
        },
      ],
      delete: {
        operationId: "closeAccount",
        responses: { 204: { description: "Closed" } },
      },
    },
  },
  components: {
    schemas: {
      Status: {
        type: "string",
        enum: ["open", "closed"],
        "x-enum-varnames": ["Open", "Closed"],
      },
      Account: {
        type: "object",
        required: ["id", "status", "owner"],
        properties: {
          id: { type: "integer" },
          status: { $ref: "#/components/schemas/Status" },
          owner: { $ref: "#/components/schemas/Owner" },
        },
      },
      Owner: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" } },
      },
      "new-account": {
        type: "object",
        required: ["owner"],
        properties: { owner: { $ref: "#/components/schemas/Owner" } },
      },
      Problem: {
        type: "object",
        required: ["detail"],
        properties: { detail: { type: "string" } },
      },
      // Not referenced by any operation, but still part of the contract.
      Unused: { type: "boolean" },
      // Would collide with the HTTP provider's class.
      "http-client": { type: "string" },
    },
  },
};

async function generate(
  $: Files,
  spec: object = SPEC,
  options: ConstructorParameters<typeof CodeGenerator>[2] = {
    client: { typeSuffix: "Dto", moduleClassSuffix: "Client" },
    typeOptions: { enumStyle: "enum" },
  },
): Promise<string[]> {
  await $.add("spec.json", JSON.stringify(spec));
  return new CodeGenerator(
    $.path("spec.json"),
    $.path("api"),
    options,
  ).generateClientOnly();
}

/** Strictly compiles `files` with the DOM library, as a browser app would. */
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
    verbatimModuleSyntax: true,
  });
  return ts
    .getPreEmitDiagnostics(program)
    .map(
      (diagnostic) =>
        `${diagnostic.file?.fileName ?? ""}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
    );
}

describe("standalone API client", () => {
  it("writes only the client, with one file per data contract", async () => {
    await usingTemporaryFiles(async ($) => {
      const written = await generate($);

      expect(written.sort()).toEqual([
        "client/AccountsClient.ts",
        "client/data-contracts.ts",
        "client/data-contracts/AccountDto.ts",
        "client/data-contracts/HttpClientDto.ts",
        "client/data-contracts/NewAccountDto.ts",
        "client/data-contracts/OwnerDto.ts",
        "client/data-contracts/ProblemDto.ts",
        "client/data-contracts/StatusDto.ts",
        "client/data-contracts/UnusedDto.ts",
        "client/http-client.ts",
        "client/index.ts",
      ]);

      await expect($.read("api/types/index.ts")).rejects.toThrow();
      await expect($.read("api/routes/_.context.ts")).rejects.toThrow();
      await expect($.read("api/.cache/openapi.yaml")).rejects.toThrow();

      expect(await $.read("api/client/data-contracts.ts")).toContain(
        'export * from "./data-contracts/AccountDto.js";\nexport * from "./data-contracts/HttpClientDto.js";',
      );
      const account = await $.read("api/client/data-contracts/AccountDto.ts");
      expect(account).toContain(
        'import type { OwnerDto } from "./OwnerDto.js";',
      );
      expect(account).toContain("export type AccountDto = {");
      expect(await $.read("api/client/data-contracts/StatusDto.ts")).toContain(
        "export enum StatusDto {",
      );

      const module = await $.read("api/client/AccountsClient.ts");
      expect(module).not.toContain("../");
      expect(module).toContain(
        'import type { AccountDto } from "./data-contracts/AccountDto.js";',
      );
      expect(module).toContain(
        "createAccount = (data: NewAccountDto, params: RequestParams = {}) =>",
      );
      expect(module).toContain("this.http.request<AccountDto, ProblemDto>({");
      expect(await $.read("api/client/index.ts")).toContain(
        'export * from "./data-contracts.js";',
      );
    });
  });

  it("type checks request arguments and response data against the OpenAPI document", async () => {
    await usingTemporaryFiles(async ($) => {
      await generate($);
      await $.add(
        "consumer.ts",
        `
        import {
          Api,
          StatusDto,
          type AccountDto,
          type ProblemDto,
          type UnusedDto,
        } from "./api/client/index.js";

        export async function consume(api: Api): Promise<void> {
          const accounts: AccountDto[] = (
            await api.accountsClient.listAccounts({ status: StatusDto.Open })
          ).data;
          const created = await api.accountsClient.createAccount({
            owner: { name: "Ada" },
          });
          const account: AccountDto = created.data;
          const problem: ProblemDto = created.error;
          const closed: void = (await api.accountsClient.closeAccount(7)).data;
          const unused: UnusedDto = true;

          // @ts-expect-error path parameters are typed from the document
          await api.accountsClient.closeAccount("seven");
          // @ts-expect-error required query parameters are enforced
          await api.accountsClient.listAccounts({ page: 1 });
          // @ts-expect-error request bodies are typed from the document
          await api.accountsClient.createAccount({ owner: {} });

          void [accounts, account, problem, closed, unused];
        }
        `,
      );

      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
    });
  });

  it("reads Swagger 2.0 body, path and query parameters and definitions", async () => {
    await usingTemporaryFiles(async ($) => {
      await generate(
        $,
        {
          swagger: "2.0",
          info: { title: "Pets", version: "1" },
          paths: {
            "/pets/{petId}": {
              put: {
                operationId: "updatePet",
                parameters: [
                  { in: "path", name: "petId", required: true, type: "string" },
                  { in: "query", name: "notify", type: "boolean" },
                  {
                    in: "body",
                    name: "pet",
                    required: true,
                    schema: { $ref: "#/definitions/Pet" },
                  },
                ],
                responses: {
                  200: {
                    description: "OK",
                    schema: { $ref: "#/definitions/Pet" },
                  },
                },
              },
            },
          },
          definitions: {
            Pet: {
              type: "object",
              required: ["name"],
              properties: { name: { type: "string" } },
            },
          },
        },
        { client: true },
      );

      expect(await $.read("api/client/Pets.ts")).toContain(
        "updatePet = (\n    petId: string,\n    data: Pet,\n    query?: { notify?: boolean },",
      );
      await $.add(
        "consumer.ts",
        `
        import { Api, type Pet } from "./api/client/index.js";

        export async function consume(api: Api): Promise<Pet> {
          return (await api.pets.updatePet("1", { name: "Rex" })).data;
        }
        `,
      );
      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
    });
  });

  it("removes stale data contracts and keeps files the user added", async () => {
    await usingTemporaryFiles(async ($) => {
      await generate($);
      await $.add("api/client/data-contracts/Mine.ts", "export {};\n");

      const { Unused: _unused, ...schemas } = SPEC.components.schemas;
      await generate($, { ...SPEC, components: { schemas } });

      await expect(
        $.read("api/client/data-contracts/UnusedDto.ts"),
      ).rejects.toThrow();
      expect(await $.read("api/client/data-contracts/Mine.ts")).toBe(
        "export {};\n",
      );
      expect(await $.read("api/client/data-contracts.ts")).not.toContain(
        "Unused",
      );
    });
  });

  it("switches between standalone and shared-type clients, removing the other mode's files", async () => {
    await usingTemporaryFiles(async ($) => {
      await generate($);

      await new CodeGenerator($.path("spec.json"), $.path("api"), {
        types: true,
        client: { typeSuffix: "Dto", moduleClassSuffix: "Client" },
      }).generate();

      await expect(
        $.read("api/client/data-contracts/AccountDto.ts"),
      ).rejects.toThrow();
      expect(await $.read("api/client/AccountsClient.ts")).toContain(
        'import type { Routes } from "../types/index.js";',
      );
      expect(await $.read("api/client/data-contracts.ts")).toContain(
        'export type AccountDto = Schemas["Account"];',
      );

      await generate($);

      const module = await $.read("api/client/AccountsClient.ts");
      expect(module).not.toContain("../types/");
      expect(module).not.toContain("../counterfact-types/");
      expect(await $.read("api/client/data-contracts/AccountDto.ts")).toContain(
        "export type AccountDto",
      );
    });
  });

  it("applies the schema type options to data contracts", async () => {
    await usingTemporaryFiles(async ($) => {
      await generate($, SPEC, {
        client: true,
        typeOptions: {
          enumStyle: "const",
          ignoreNullable: true,
          preferInterfaces: true,
          validationJsDoc: true,
        },
      });

      expect(await $.read("api/client/data-contracts/Status.ts")).toContain(
        'export const Status = {\n  Open: "open",\n  Closed: "closed",\n} as const;',
      );
      expect(await $.read("api/client/data-contracts/Account.ts")).toContain(
        "export interface Account {",
      );

      await $.add(
        "consumer.ts",
        `
        import { Status, type Account } from "./api/client/index.js";

        export const account: Account = {
          id: 1,
          status: Status.Closed,
          owner: { name: "Ada" },
        };
        `,
      );
      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
    });
  });

  it("honors the client options", async () => {
    await usingTemporaryFiles(async ($) => {
      await generate($, SPEC, {
        client: {
          apiClassName: "AccountsApi",
          typePrefix: "I",
          unwrapResponseData: true,
        },
      });

      expect(await $.read("api/client/index.ts")).toContain(
        "export class AccountsApi {",
      );
      await $.add(
        "consumer.ts",
        `
        import { AccountsApi, type IAccount } from "./api/client/index.js";

        export async function consume(api: AccountsApi): Promise<IAccount> {
          return api.accounts.createAccount({ owner: { name: "Ada" } });
        }
        `,
      );
      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
    });
  });

  it("serializes form bodies and declares schemas reached through nested references", async () => {
    await usingTemporaryFiles(async ($) => {
      await generate(
        $,
        {
          openapi: "3.1.0",
          info: { title: "Files", version: "1" },
          paths: {
            "/files": {
              post: {
                operationId: "upload",
                requestBody: {
                  content: {
                    "multipart/form-data": {
                      schema: {
                        type: "object",
                        properties: { name: { type: "string" } },
                      },
                    },
                  },
                },
                responses: {
                  200: {
                    description: "OK",
                    content: {
                      "application/json": {
                        schema: {
                          $ref: "#/components/schemas/Folder/properties/file",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          components: {
            schemas: {
              Folder: {
                type: "object",
                properties: {
                  file: {
                    type: "object",
                    required: ["size"],
                    properties: { size: { type: "integer" } },
                  },
                },
              },
            },
          },
        },
        { client: true },
      );

      const module = await $.read("api/client/Files.ts");
      expect(module).toContain(
        'import { ContentType } from "./http-client.js";',
      );
      expect(module).toContain("type: ContentType.FormData,");
      expect(module).toContain("data?: { name?: string }");
      expect(await $.read("api/client/data-contracts/File.ts")).toContain(
        "export type File = { size: number };",
      );
      expect(await $.read("api/client/data-contracts.ts")).toContain(
        'export * from "./data-contracts/File.js";',
      );

      await $.add(
        "consumer.ts",
        `
        import { Api, type File } from "./api/client/index.js";

        export async function consume(api: Api): Promise<number> {
          const file: File = (await api.files.upload({ name: "a.txt" })).data;
          return file.size;
        }
        `,
      );
      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
    });
  });

  it("renames data contracts that collide with module classes", async () => {
    await usingTemporaryFiles(async ($) => {
      await generate(
        $,
        {
          openapi: "3.1.0",
          info: { title: "Users", version: "1" },
          paths: {
            "/users": {
              get: {
                operationId: "listUsers",
                responses: {
                  200: {
                    description: "OK",
                    content: {
                      "application/json": {
                        schema: { $ref: "#/components/schemas/Users" },
                      },
                    },
                  },
                },
              },
            },
          },
          components: {
            schemas: { Users: { type: "array", items: { type: "string" } } },
          },
        },
        { client: true },
      );

      expect(await $.read("api/client/data-contracts/Users2.ts")).toContain(
        "export type Users2 = Array<string>;",
      );
      expect(await $.read("api/client/Users.ts")).toContain(
        "this.http.request<Users2, unknown>({",
      );
      expect(diagnostics($.path("api/client/index.ts"))).toEqual([]);
    });
  });

  it("omits data contracts when the document has no schemas", async () => {
    await usingTemporaryFiles(async ($) => {
      const written = await generate(
        $,
        {
          openapi: "3.1.0",
          info: { title: "Health", version: "1" },
          paths: {
            "/health": {
              get: {
                operationId: "health",
                responses: {
                  200: {
                    description: "OK",
                    content: {
                      "text/plain": { schema: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
        { client: true },
      );

      expect(written.sort()).toEqual([
        "client/Health.ts",
        "client/http-client.ts",
        "client/index.ts",
      ]);
      expect(await $.read("api/client/index.ts")).not.toContain(
        "data-contracts",
      );
      expect(diagnostics($.path("api/client/index.ts"))).toEqual([]);
    });
  });

  it("names a shared error schema once in an operation's error type", async () => {
    const error = {
      description: "Error",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/Problem" },
        },
      },
    };

    await usingTemporaryFiles(async ($) => {
      await generate(
        $,
        {
          openapi: "3.1.0",
          info: { title: "Login", version: "1" },
          paths: {
            "/login": {
              post: {
                operationId: "login",
                responses: {
                  204: { description: "OK" },
                  400: error,
                  401: error,
                  500: error,
                },
              },
            },
          },
          components: {
            schemas: {
              Problem: {
                type: "object",
                properties: { message: { type: "string" } },
              },
            },
          },
        },
        { client: true },
      );

      const module = await $.read("api/client/Login.ts");

      expect(module).toContain("this.http.request<void, Problem>(");
      expect(module).not.toContain("Problem | Problem");
      expect(diagnostics($.path("api/client/index.ts"))).toEqual([]);
    });
  });

  it("rejects versioned APIs", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("spec.json", JSON.stringify(SPEC));
      await expect(
        new CodeGenerator(
          $.path("spec.json"),
          $.path("api"),
          { client: true },
          "v1",
        ).generateClientOnly(),
      ).rejects.toThrow("does not support versioned APIs");
    });
  });
});
