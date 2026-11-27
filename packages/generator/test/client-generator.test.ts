import { fileURLToPath } from "node:url";

import { jest } from "@jest/globals";
import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import { generateClient } from "../src/client-generator.js";
import { CodeGenerator } from "../src/code-generator.js";
import { Specification } from "../src/specification.js";

const PETSTORE_FIXTURE = fileURLToPath(
  new URL("./petstore.yaml", import.meta.url),
);
const EXAMPLE_FIXTURE = fileURLToPath(
  new URL(
    "../../counterfact/test/fixtures/openapi/example.yaml",
    import.meta.url,
  ),
);
const SWAGGER2_FIXTURE = fileURLToPath(
  new URL(
    "../../counterfact/test/fixtures/openapi/swagger2.yaml",
    import.meta.url,
  ),
);

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
    allowImportingTsExtensions: true,
  });
  return ts
    .getPreEmitDiagnostics(program)
    .map(
      (diagnostic) =>
        `${diagnostic.file?.fileName ?? ""}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
    );
}

const USERS_SPEC = {
  openapi: "3.1.0",
  info: { title: "Users", version: "1" },
  security: [{ bearer: [] }],
  paths: {
    "/": {
      get: {
        operationId: "health",
        security: [],
        responses: {
          200: {
            description: "OK",
            content: { "text/plain": { schema: { type: "string" } } },
          },
        },
      },
    },
    "/users": {
      get: {
        operationId: "listUsers",
        tags: ["people"],
        summary: "List users",
        parameters: [
          { in: "query", name: "page", schema: { type: "integer" } },
          { in: "header", name: "X-Trace", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/User" },
                },
              },
            },
          },
        },
      },
      post: {
        operationId: "createUser",
        tags: ["people"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/NewUser" },
            },
          },
        },
        responses: {
          201: {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/User" },
              },
            },
          },
          400: {
            description: "Invalid",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Problem" },
              },
            },
          },
        },
      },
    },
    "/users/{user-id}": {
      parameters: [
        {
          in: "path",
          name: "user-id",
          required: true,
          schema: { type: "integer" },
        },
      ],
      get: {
        operationId: "getUser",
        deprecated: true,
        description: "Fetch one user.\nUse listUsers for many.",
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/User" },
              },
            },
          },
        },
      },
      delete: { responses: { 204: { description: "Deleted" } } },
    },
    "/uploads": {
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
            content: { "image/png": { schema: {} } },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    schemas: {
      User: {
        type: "object",
        required: ["id", "name"],
        properties: { id: { type: "integer" }, name: { type: "string" } },
      },
      NewUser: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" } },
      },
      Problem: {
        type: "object",
        required: ["message"],
        properties: { message: { type: "string" } },
      },
      "http-client": { type: "string" },
    },
  },
};

async function generateUsersClient(
  $: Parameters<Parameters<typeof usingTemporaryFiles>[0]>[0],
  client: ConstructorParameters<typeof CodeGenerator>[2]["client"] = true,
) {
  await $.add("spec.json", JSON.stringify(USERS_SPEC));
  await new CodeGenerator($.path("spec.json"), $.path("api"), {
    types: true,
    client,
  }).generate();
}

describe("generated API client", () => {
  it("writes one module per resource plus the HTTP provider, data contracts and an index", async () => {
    await usingTemporaryFiles(async ($) => {
      await generateUsersClient($);

      expect(await $.read("api/client/Users.ts")).toMatchSnapshot("Users.ts");
      expect(await $.read("api/client/Root.ts")).toMatchSnapshot("Root.ts");
      expect(await $.read("api/client/Uploads.ts")).toMatchSnapshot(
        "Uploads.ts",
      );
      expect(await $.read("api/client/index.ts")).toMatchSnapshot("index.ts");
      expect(await $.read("api/client/data-contracts.ts")).toMatchSnapshot(
        "data-contracts.ts",
      );
      expect(await $.read("api/client/http-client.ts")).toContain(
        "export class HttpClient<SecurityDataType = unknown> implements HttpProvider",
      );
      // The root context the generated types import exists even without routes.
      expect(await $.read("api/routes/_.context.ts")).toContain(
        "export class Context",
      );
    });
  });

  it("type checks request arguments and response data against the OpenAPI document", async () => {
    await usingTemporaryFiles(async ($) => {
      await generateUsersClient($);
      await $.add(
        "consumer.ts",
        `
        import {
          Api,
          HttpClient,
          Users,
          type FullRequestParams,
          type HttpProvider,
          type HttpResponse,
          type NewUser,
          type User,
        } from "./api/client/index.js";

        const http = new HttpClient<string>({
          baseUrl: "https://example.test",
          securityWorker: (token) =>
            token ? { headers: { Authorization: \`Bearer \${token}\` } } : {},
        });
        http.setSecurityData("token");

        class RecordingProvider implements HttpProvider {
          public readonly calls: FullRequestParams[] = [];
          public request<Data, Error>(
            params: FullRequestParams,
          ): Promise<HttpResponse<Data, Error>> {
            this.calls.push(params);
            return http.request<Data, Error>(params);
          }
        }

        export async function consume(): Promise<void> {
          const api = new Api(http);
          const provider: HttpProvider = api.http;

          const users: User[] = (await api.users.listUsers({ page: 2 })).data;
          const created: User = (await api.users.createUser({ name: "Ada" })).data;
          const user: User = (await api.users.getUser(7)).data;
          const deleted: void = (await api.users.usersDelete(7)).data;
          const health: string = (await api.root.health()).data;

          try {
            await api.users.createUser({ name: "" } satisfies NewUser);
          } catch (error) {
            const problem = (error as Awaited<ReturnType<Users["createUser"]>>).error;
            const message: string = problem.message;
            void message;
          }

          await new Users(new RecordingProvider()).listUsers();
          await new Users().listUsers(undefined, { headers: { "X-Trace": "1" } });

          // @ts-expect-error path parameters are typed from the document
          await api.users.getUser("seven");
          // @ts-expect-error unknown query parameters are rejected
          await api.users.listUsers({ limit: 1 });
          // @ts-expect-error request bodies are typed from the document
          await api.users.createUser({ nickname: "Ada" });
          // @ts-expect-error response data is typed from the document
          const wrong: string = (await api.users.getUser(7)).data;

          void [provider, users, created, user, deleted, health, wrong];
        }
        `,
      );

      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
    });
  });

  it("resolves with response data when unwrapResponseData is set", async () => {
    await usingTemporaryFiles(async ($) => {
      await generateUsersClient($, {
        unwrapResponseData: true,
        apiClassName: "UsersApi",
      });
      await $.add(
        "consumer.ts",
        `
        import { UsersApi, type User } from "./api/client/index.js";

        export async function consume(api: UsersApi): Promise<void> {
          const user: User = await api.users.getUser(1);
          const users: User[] = await api.users.listUsers();
          void [user, users];
        }
        `,
      );

      expect(await $.read("api/client/Users.ts")).toContain(
        ".then((response) => response.data)",
      );
      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
    });
  });

  it("groups modules by the first tag when moduleNameFirstTag is set", async () => {
    await usingTemporaryFiles(async ($) => {
      await generateUsersClient($, { moduleNameFirstTag: true });

      const index = await $.read("api/client/index.ts");

      expect(index).toContain("public readonly people: People;");
      expect(index).toContain("public readonly users: Users;");
      expect(await $.read("api/client/People.ts")).toContain("listUsers = (");
    });
  });

  it("supports a treasury-management style setup: suffixed names, an injected fetch and subclass overrides", async () => {
    await usingTemporaryFiles(async ($) => {
      await generateUsersClient($, {
        moduleClassSuffix: "Client",
        typeSuffix: "Dto",
      });
      await $.add(
        "consumer.ts",
        `
        import {
          HttpClient,
          UsersClient,
          type NewUserDto,
          type UserDto,
        } from "./api/client/index.js";

        declare module "./api/client/http-client.js" {
          interface FullRequestParams {
            preferAsync?: boolean;
          }
        }

        export const seen: unknown[] = [];

        // An app's own HTTP stack, reached through customFetch.
        export const http = new HttpClient({
          customFetch: async (input, init) => {
            seen.push([String(input), (init as { preferAsync?: boolean }).preferAsync]);
            return Response.json({ id: 1, name: "Ada" });
          },
        });

        export class PatchedUsersClient extends UsersClient {
          public override getUser = (userId: number) =>
            this.http.request<UserDto>({ path: \`/users/\${userId}\`, format: "json" });
        }

        export async function consume(): Promise<UserDto> {
          const body: NewUserDto = { name: "Ada" };
          await new UsersClient(http).createUser(body, { preferAsync: true });
          return (await new PatchedUsersClient(http).getUser(1)).data;
        }
        `,
      );

      expect(await $.read("api/client/data-contracts.ts")).toContain(
        'export type UserDto = Schemas["User"];',
      );
      expect(await $.read("api/client/index.ts")).toContain(
        "public readonly usersClient: UsersClient;",
      );
      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
    });
  });

  it("rejects name affixes that are not identifier characters", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("spec.json", JSON.stringify(USERS_SPEC));

      await expect(
        generateClient(
          await Specification.fromFile($.path("spec.json")),
          $.path("out"),
          { typeSuffix: "-dto" },
        ),
      ).rejects.toThrow(/typeSuffix must contain only identifier characters/u);
    });
  });

  it.each([
    ["the pet store", PETSTORE_FIXTURE],
    ["the example API", EXAMPLE_FIXTURE],
    ["a Swagger 2.0 document", SWAGGER2_FIXTURE],
  ])("compiles the client generated for %s", async (_, fixture) => {
    await usingTemporaryFiles(async ($) => {
      await new CodeGenerator(fixture, $.path("api"), {
        types: true,
        client: true,
      }).generate();

      expect(diagnostics($.path("api/client/index.ts"))).toEqual([]);
    });
  });

  it("removes stale generated client files and keeps files the user added", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "api/client/Old.ts",
        "// This code was automatically generated by Counterfact.\nexport {};\n",
      );
      await $.add("api/client/custom.ts", "export const mine = 1;\n");
      await $.add("api/client/notes.md", "keep me\n");

      await generateUsersClient($);

      await expect($.read("api/client/Old.ts")).rejects.toThrow();
      expect(await $.read("api/client/custom.ts")).toBe(
        "export const mine = 1;\n",
      );
      expect(await $.read("api/client/notes.md")).toBe("keep me\n");
    });
  });

  it("returns the written files and omits data contracts when there are no schemas", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "spec.json",
        JSON.stringify({
          openapi: "3.0.3",
          info: { title: "Ping", version: "1" },
          paths: {
            "/ping": { get: { responses: { 204: { description: "OK" } } } },
          },
        }),
      );

      const files = await generateClient(
        await Specification.fromFile($.path("spec.json")),
        $.path("api"),
      );

      expect(files).toEqual([
        "client/http-client.ts",
        "client/Ping.ts",
        "client/index.ts",
      ]);
      expect(await $.read("api/client/index.ts")).not.toContain(
        "data-contracts",
      );
    });
  });

  it("keeps every line of a multi-line summary inside the JSDoc", async () => {
    const spec = {
      openapi: "3.0.3",
      info: { title: "Login", version: "1" },
      paths: {
        "/login": {
          post: {
            summary: "Starts a login.\r\nReturns the credentials.",
            description: "First line.\nSecond line.",
            responses: { 204: { description: "OK" } },
          },
        },
      },
    };

    await usingTemporaryFiles(async ($) => {
      await $.add("spec.json", JSON.stringify(spec));
      const specification = await Specification.fromFile($.path("spec.json"));

      for (const standalone of [false, true]) {
        await generateClient(specification, $.path("api"), { standalone });

        const module = await $.read("api/client/Login.ts");
        const comment = module.slice(
          module.indexOf("/**"),
          module.indexOf("*/") + 2,
        );

        expect(comment).toContain("* @summary Starts a login.\n");
        expect(comment).toMatch(/\n\s*\* Returns the credentials\.\n/u);
        expect(comment).toMatch(/\n\s*\* Second line\.\n/u);
        expect(comment).not.toContain("\r");
        // Every line between the delimiters keeps its leading asterisk.
        expect(
          comment
            .split("\n")
            .slice(1, -1)
            .every((line) => line.trimStart().startsWith("*")),
        ).toBe(true);
      }
    });
  });

  it("renames a module that would collide with the API class", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "spec.json",
        JSON.stringify({
          openapi: "3.0.3",
          info: { title: "Api", version: "1" },
          paths: {
            "/api": { get: { responses: { 204: { description: "OK" } } } },
          },
        }),
      );

      const files = await generateClient(
        await Specification.fromFile($.path("spec.json")),
        $.path("out"),
      );

      expect(files).toContain("client/ApiModule.ts");
    });
  });

  it("rejects an API class name that the client reserves", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("spec.json", JSON.stringify(USERS_SPEC));

      await expect(
        generateClient(
          await Specification.fromFile($.path("spec.json")),
          $.path("out"),
          { apiClassName: "HttpClient" },
        ),
      ).rejects.toThrow(/reserved/u);
    });
  });

  it("gives every module a distinct name when renaming one away from the API class", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "spec.json",
        JSON.stringify({
          openapi: "3.0.3",
          info: { title: "Api", version: "1" },
          paths: {
            "/api": { get: { responses: { 204: { description: "OK" } } } },
            "/api-module": {
              get: { responses: { 204: { description: "OK" } } },
            },
          },
        }),
      );
      await new CodeGenerator($.path("spec.json"), $.path("api"), {
        types: true,
        client: true,
      }).generate();

      const index = await $.read("api/client/index.ts");
      expect(index).toContain('from "./ApiModule.js"');
      expect(index).toContain('from "./ApiModule2.js"');
      expect(diagnostics($.path("api/client/index.ts"))).toEqual([]);
    });
  });

  it("keeps a shared data contract named like a module importable from the barrel", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "spec.json",
        JSON.stringify({
          openapi: "3.0.3",
          info: { title: "T", version: "1" },
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
            schemas: {
              Users: {
                type: "object",
                required: ["count"],
                properties: { count: { type: "integer" } },
              },
            },
          },
        }),
      );
      await new CodeGenerator($.path("spec.json"), $.path("api"), {
        types: true,
        client: true,
      }).generate();
      await $.add(
        "consumer.ts",
        `
        import { Api, Users, type Users2 } from "./api/client/index.js";

        export async function consume(): Promise<number> {
          const list: Users2 = (await new Api().users.listUsers()).data;
          void new Users();
          return list.count;
        }
        `,
      );

      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
    });
  });

  it("types bodies the route types do not describe as unknown, so they can be sent", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "spec.json",
        JSON.stringify({
          openapi: "3.0.3",
          info: { title: "T", version: "1" },
          paths: {
            "/notes": {
              post: {
                operationId: "addNote",
                requestBody: {
                  required: true,
                  content: { "text/plain": { schema: { type: "string" } } },
                },
                responses: { 204: { description: "OK" } },
              },
            },
          },
        }),
      );
      await new CodeGenerator($.path("spec.json"), $.path("api"), {
        types: true,
        client: true,
      }).generate();
      await $.add(
        "consumer.ts",
        `
        import { Api } from "./api/client/index.js";

        export async function consume(): Promise<void> {
          await new Api().notes.addNote("remember the milk");
        }
        `,
      );

      expect(await $.read("api/client/Notes.ts")).toContain("data: unknown");
      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
    });
  });

  it.each([
    [{ typePrefix: "1" }, /typePrefix must not start with a digit/u],
    [{ apiClassName: "class" }, /not a valid TypeScript class name/u],
    [{ apiClassName: "my-api" }, /not a valid TypeScript class name/u],
    [{ apiClassName: "string" }, /not a valid TypeScript class name/u],
  ])("rejects the client options %j", async (options, message) => {
    await usingTemporaryFiles(async ($) => {
      await $.add("spec.json", JSON.stringify(USERS_SPEC));

      await expect(
        generateClient(
          await Specification.fromFile($.path("spec.json")),
          $.path("out"),
          options,
        ),
      ).rejects.toThrow(message);
    });
  });

  it("accepts the shared multipart file type for binary form fields", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "spec.json",
        JSON.stringify({
          openapi: "3.0.3",
          info: { title: "T", version: "1" },
          paths: {
            "/avatars": {
              post: {
                operationId: "upload",
                requestBody: {
                  required: true,
                  content: {
                    "multipart/form-data": {
                      schema: {
                        type: "object",
                        required: ["image"],
                        properties: {
                          image: { type: "string", format: "binary" },
                        },
                      },
                    },
                  },
                },
                responses: { 204: { description: "OK" } },
              },
            },
          },
        }),
      );
      await new CodeGenerator($.path("spec.json"), $.path("api"), {
        types: true,
        client: true,
      }).generate();
      await $.add(
        "consumer.ts",
        `
        import { Api } from "./api/client/index.js";

        export async function consume(): Promise<void> {
          // HttpClient uploads this as a binary part named me.png.
          await new Api().avatars.upload({
            image: {
              data: new Uint8Array([1, 2, 3]),
              filename: "me.png",
              contentType: "image/png",
              size: 3,
            },
          });
        }
        `,
      );

      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
    });
  });

  it("does not generate a client unless types are generated", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("spec.json", JSON.stringify(USERS_SPEC));
      await new CodeGenerator($.path("spec.json"), $.path("api"), {
        routes: true,
        client: true,
      }).generate();

      await expect($.read("api/client/index.ts")).rejects.toThrow();
    });
  });

  it("skips versioned APIs with a warning", async () => {
    await usingTemporaryFiles(async ($) => {
      const write = jest
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);

      try {
        await $.add("spec.json", JSON.stringify(USERS_SPEC));
        await new CodeGenerator(
          $.path("spec.json"),
          $.path("api"),
          { types: true, client: true },
          "v1",
        ).generate();

        expect(write).toHaveBeenCalledWith(
          expect.stringContaining(
            'Skipping client generation for version "v1"',
          ),
        );
        await expect($.read("api/client/index.ts")).rejects.toThrow();
      } finally {
        write.mockRestore();
      }
    });
  });
});
