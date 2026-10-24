import { describe, expect, it } from "@jest/globals";
import { usingTemporaryFiles } from "using-temporary-files";

import { updateRouteTypes } from "../../src/migrate/update-route-types.js";

const spec = (operationId = "get-pet") => ({
  openapi: "3.0.0",
  paths: {
    "/pet": {
      get: { operationId, responses: { 200: { description: "Success" } } },
      post: {
        operationId: "addPet",
        responses: { 200: { description: "Success" } },
      },
    },
  },
});

describe("method-based route type migration", () => {
  it("updates handler and parameter references while preserving text and unrelated bindings", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.json", JSON.stringify(spec()));
      const before = `import type { getPet, getPet_Query, getPet_Path, getPet_Headers, getPet_Cookie, addPet } from "../types/paths/pet.types.js";
// getPet is a spec operationId.
const message = "getPet";
function other(getPet: string) { return getPet; }
type Query = getPet_Query;
type Path = getPet_Path;
type Headers = getPet_Headers;
type Cookie = getPet_Cookie;
export const GET: getPet = ($) => ({ status: 200 });
export const POST: addPet = ($) => ({ status: 200 });
`;
      await $.add("routes/pet.ts", before);
      expect(await updateRouteTypes($.path(""), $.path("openapi.json"))).toBe(
        true,
      );
      const after = await $.read("routes/pet.ts");
      expect(after).toContain(
        "import type { HTTP_GET, HTTP_GET_Query, HTTP_GET_Path, HTTP_GET_Headers, HTTP_GET_Cookie, HTTP_POST }",
      );
      expect(after).toContain("type Query = HTTP_GET_Query;");
      expect(after).toContain("export const GET: HTTP_GET");
      expect(after).toContain("export const POST: HTTP_POST");
      expect(after).toContain(
        '// getPet is a spec operationId.\nconst message = "getPet";\nfunction other(getPet: string) { return getPet; }',
      );
      expect(await updateRouteTypes($.path(""), $.path("openapi.json"))).toBe(
        false,
      );
      expect(await $.read("routes/pet.ts")).toBe(after);
    });
  });

  it("preserves explicit aliases, inline type imports, and local-name collisions", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.json", JSON.stringify(spec()));
      await $.add(
        "routes/pet.ts",
        `import { type getPet as Handler, type getPet_Query } from '../types/paths/pet.types.ts';
type HTTP_GET_Query = string;
export const GET: Handler = () => ({ status: 200 });
type Query = getPet_Query;
`,
      );
      expect(await updateRouteTypes($.path(""), $.path("openapi.json"))).toBe(
        true,
      );
      expect(await $.read("routes/pet.ts"))
        .toBe(`import { type HTTP_GET as Handler, type HTTP_GET_Query as getPet_Query } from '../types/paths/pet.types.ts';
type HTTP_GET_Query = string;
export const GET: Handler = () => ({ status: 200 });
type Query = getPet_Query;
`);
    });
  });

  it.each(["delete", "123get-pet", "get.pet", "get-pet"])(
    "recognizes sanitized legacy name for %s",
    async (operationId) => {
      const legacy = {
        delete: "delete_",
        "123get-pet": "_123getPet",
        "get.pet": "getPet",
        "get-pet": "getPet",
      }[operationId];
      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(spec(operationId)));
        await $.add(
          "routes/pet.ts",
          `import type { ${legacy} } from "../types/paths/pet.types";\nexport const GET: ${legacy} = () => ({status: 200});`,
        );
        expect(await updateRouteTypes($.path(""), $.path("openapi.json"))).toBe(
          true,
        );
        expect(await $.read("routes/pet.ts")).toContain(
          "export const GET: HTTP_GET",
        );
      });
    },
  );

  it("leaves unrelated modules and context files untouched", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.json", JSON.stringify(spec()));
      const content =
        'import type { getPet } from "somewhere-else";\nexport const GET: getPet = () => ({status: 200});';
      await $.add("routes/pet.ts", content);
      await $.add("routes/_.context.ts", content);
      expect(await updateRouteTypes($.path(""), $.path("openapi.json"))).toBe(
        false,
      );
      expect(await $.read("routes/pet.ts")).toBe(content);
      expect(await $.read("routes/_.context.ts")).toBe(content);
    });
  });

  it("handles nested, root and trailing-slash routes", async () => {
    await usingTemporaryFiles(async ($) => {
      const document = {
        openapi: "3.0.0",
        paths: Object.fromEntries(
          ["/", "/pets/{id}/"].map((name) => [
            name,
            {
              get: {
                operationId: "getPet",
                responses: { 200: { description: "OK" } },
              },
            },
          ]),
        ),
      };
      await $.add("openapi.json", JSON.stringify(document));
      for (const [route, module] of [
        ["index", "../types/paths/index.types.ts"],
        ["pets/{id}", "../../types/paths/pets/{id}.types.ts"],
      ]) {
        await $.add(
          `routes/${route}.ts`,
          `import type {getPet} from "${module}";\nexport const GET: getPet = () => ({status: 200});`,
        );
      }
      expect(await updateRouteTypes($.path(""), $.path("openapi.json"))).toBe(
        true,
      );
      expect(await $.read("routes/index.ts")).toContain("GET: HTTP_GET");
      expect(await $.read("routes/pets/{id}.ts")).toContain("GET: HTTP_GET");
    });
  });

  it("migrates namespace type references without changing shadowed namespaces", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.json", JSON.stringify(spec()));
      await $.add(
        "routes/pet.ts",
        `import type * as Types from "../types/paths/pet.types.ts";
export const GET: Types.getPet = () => ({status: 200});
type Query = Types.getPet_Query;
namespace Other { export type getPet = string; }
type Untouched = Other.getPet;
`,
      );
      expect(await updateRouteTypes($.path(""), $.path("openapi.json"))).toBe(
        true,
      );
      const after = await $.read("routes/pet.ts");
      expect(after).toContain("GET: Types.HTTP_GET");
      expect(after).toContain("type Query = Types.HTTP_GET_Query;");
      expect(after).toContain("type Untouched = Other.getPet;");
    });
  });

  it("recognizes TRACE and OpenAPI 3.2 additional methods", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.json",
        JSON.stringify({
          openapi: "3.2.0",
          paths: {
            "/pet": {
              trace: {
                operationId: "tracePet",
                responses: { 200: { description: "OK" } },
              },
              additionalOperations: {
                QUERY: {
                  operationId: "searchPet",
                  responses: { 200: { description: "OK" } },
                },
              },
            },
          },
        }),
      );
      await $.add(
        "routes/pet.ts",
        `import type {tracePet, searchPet} from "../types/paths/pet.types.ts";
export const TRACE: tracePet = () => ({status: 200});
export const QUERY: searchPet = () => ({status: 200});`,
      );
      expect(await updateRouteTypes($.path(""), $.path("openapi.json"))).toBe(
        true,
      );
      const after = await $.read("routes/pet.ts");
      expect(after).toContain("TRACE: HTTP_TRACE");
      expect(after).toContain("QUERY: HTTP_QUERY");
    });
  });

  it("leaves stable names unchanged even when operationId exists", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.json", JSON.stringify(spec()));
      const content =
        'import type { HTTP_GET } from "../types/paths/pet.types.ts";\nexport const GET: HTTP_GET = () => ({status: 200});';
      await $.add("routes/pet.ts", content);
      expect(await updateRouteTypes($.path(""), $.path("openapi.json"))).toBe(
        false,
      );
      expect(await $.read("routes/pet.ts")).toBe(content);
    });
  });

  it("skips missing routes and spec-free projects", async () => {
    await usingTemporaryFiles(async ($) => {
      expect(await updateRouteTypes($.path(""), "_")).toBe(false);
      expect(await updateRouteTypes($.path(""), $.path("missing.json"))).toBe(
        false,
      );
    });
  });
});
