import { usingTemporaryFiles } from "using-temporary-files";

import { CodeGenerator } from "../src/code-generator.js";
import { Repository } from "../src/repository.js";
import { CaseLayout } from "../src/route-file-layout.js";

function contract(paths: Record<string, readonly string[]>): string {
  return JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Case routes", version: "1.0.0" },
    paths: Object.fromEntries(
      Object.entries(paths).map(([path, methods]) => [
        path,
        Object.fromEntries(
          methods.map((method) => [
            method,
            { responses: { "204": { description: "No content" } } },
          ]),
        ),
      ]),
    ),
  });
}

describe("generated case-sensitive routes", () => {
  it("keeps the plain layout for routes without a collision and coalesces disjoint methods", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.json",
        contract({
          "/Pet": ["get"],
          "/pet": ["post"],
          "/Reports/Daily": ["get"],
          "/reports/Weekly": ["get"],
        }),
      );
      await new CodeGenerator($.path("openapi.json"), $.path("out"), {
        routes: true,
        types: true,
        prune: true,
      }).generate();

      const collision = await $.read("out/routes/Pet.ts");
      expect(collision).toContain('["/Pet", "/pet"]');
      expect(collision).toContain('"/Pet": Routes["/Pet"]["GET"]');
      expect(collision).toContain('"/pet": Routes["/pet"]["POST"]');
      const singleton = await $.read("out/routes/Reports/Daily.ts");
      expect(singleton).not.toContain("__counterfactPaths");
      // A file that only shares a merged directory is not a collision.
      expect(await $.read("out/routes/Reports/Weekly.ts")).not.toContain(
        "__counterfactPaths",
      );
      expect(singleton).toContain('export const GET: Route["GET"]');

      const edited = collision + "\n// authored change\n";
      await $.add("out/routes/Pet.ts", edited);
      await new CodeGenerator($.path("openapi.json"), $.path("out"), {
        routes: true,
        types: true,
        prune: true,
      }).generate();
      expect(await $.read("out/routes/Pet.ts")).toEqual(edited);
      const types = await $.read("out/types/paths/Pet.types.ts");
      expect(types).toContain("export type HTTP_GET");
      expect(types).toContain("export type HTTP_POST");
    });
  });

  it("migrates an edited handler and preserves its relative imports", async () => {
    await usingTemporaryFiles(async ($) => {
      const authored =
        'import { answer } from "./support.js";\nexport const GET = () => ({ body: answer });\n';
      await $.add("out/routes/pet.ts", authored);
      await $.add("out/routes/support.ts", 'export const answer = "edited";');
      await $.add(
        "openapi.json",
        contract({ "/Pet": ["get"], "/pet": ["get"] }),
      );
      await new CodeGenerator($.path("openapi.json"), $.path("out"), {
        routes: true,
        types: true,
      }).generate();
      const wrapper = await $.read("out/routes/Pet.ts");
      expect(wrapper).toMatch(/"\/pet": legacy1.GET/u);
      const stored = wrapper.match(
        /\.\/(?<legacy>_\.counterfact-legacy-[a-f0-9]+)\.js/u,
      );
      expect(stored).not.toBeNull();
      expect(await $.read(`out/routes/${stored!.groups!.legacy!}.ts`)).toEqual(
        authored,
      );
      expect(await $.read("out/routes/support.ts")).toContain("edited");
      await $.add(
        "openapi.json",
        contract({ "/pet": ["get"], "/Pet": ["get"] }),
      );
      await new CodeGenerator($.path("openapi.json"), $.path("out"), {
        routes: true,
        types: true,
        prune: true,
      }).generate();
      expect(await $.read("out/routes/Pet.ts")).toEqual(wrapper);
      expect(await $.read("out/routes/support.ts")).toContain("edited");
    });
  });

  it("fails before changing an authored module with a dynamic handler re-export", async () => {
    await usingTemporaryFiles(async ($) => {
      const authored = 'export { GET } from "./custom.js";\n';
      await $.add("out/routes/pet.ts", authored);
      await $.add(
        "openapi.json",
        contract({ "/Pet": ["get"], "/pet": ["get"] }),
      );
      await expect(
        new CodeGenerator($.path("openapi.json"), $.path("out"), {
          routes: true,
          types: true,
          prune: true,
        }).generate(),
      ).rejects.toThrow("Move re-exported handlers");
      expect(await $.read("out/routes/pet.ts")).toEqual(authored);
    });
  });

  it("keeps every version of case-variant paths in one handler type", async () => {
    await usingTemporaryFiles(async ($) => {
      const repository = new Repository();
      for (const version of ["v1", "v2"]) {
        await $.add(
          `${version}.json`,
          contract({ "/Pet": ["get"], "/pet": ["get"] }),
        );
        await new CodeGenerator(
          $.path(`${version}.json`),
          $.path("out"),
          { routes: true, types: true },
          version,
        ).generate(repository);
      }

      const types = await $.read("out/types/paths/Pet.types.ts");
      const maps = [...types.matchAll(/_\$_Versions = \{(?<body>[^}]*)\}/gu)];
      expect(maps).toHaveLength(2);
      for (const map of maps) {
        expect(map.groups!.body).toContain("v1:");
        expect(map.groups!.body).toContain("v2:");
      }
    });
  });

  it("selects the smallest spelling separately for each directory and file", () => {
    const layout = new CaseLayout();
    const paths = [
      "routes/petmodels/itembyid.ts",
      "routes/PetModels/ItemById.ts",
      "routes/PETMODELS/OtherItem.ts",
    ];
    for (const path of paths) layout.file(path);
    expect(layout.file("routes/petmodels/itembyid.ts")).toBe(
      "routes/PETMODELS/ItemById.ts",
    );
    expect(layout.file("routes/PetModels/OtherItem.ts")).toBe(
      "routes/PETMODELS/OtherItem.ts",
    );

    const reversed = new CaseLayout();
    for (const path of [...paths].reverse()) reversed.file(path);
    expect(paths.map((path) => reversed.file(path))).toEqual(
      paths.map((path) => layout.file(path)),
    );
  });

  it("keeps a pinned spelling over a smaller one", () => {
    const layout = new CaseLayout();
    layout.pin("routes/pet.ts");
    layout.file("routes/Pet.ts");
    expect(layout.file("routes/PET.ts")).toBe("routes/pet.ts");
  });

  it("leaves an existing project without case collisions unchanged", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.json",
        contract({ "/pets/{petId}": ["get"], "/Reports/Daily": ["get"] }),
      );
      const authored = [
        'import type { Routes } from "../../types/index.js";',
        'type Route = Routes["/pets"]["/{petId}"];',
        'export const GET: Route["GET"] = async ($) => $.response[204].empty();',
        "",
      ].join("\n");
      await $.add("out/routes/pets/{petId}.ts", authored);
      await $.add(
        "out/routes/Reports/Daily.js",
        "export const GET = ($) => $.response[204].empty();\n",
      );
      await $.add(
        "out/routes/_.middleware.js",
        "export const middleware = ($, respondTo) => respondTo($);\n",
      );

      for (let run = 0; run < 2; run += 1)
        await new CodeGenerator($.path("openapi.json"), $.path("out"), {
          routes: true,
          types: true,
        }).generate();

      expect(await $.read("out/routes/pets/{petId}.ts")).toEqual(authored);
      await expect(
        $.read("out/routes/.counterfact-migrated-routes.json"),
      ).rejects.toThrow();
    });
  });

  it("appends a new method to an existing shared route file", async () => {
    await usingTemporaryFiles(async ($) => {
      const generate = () =>
        new CodeGenerator($.path("openapi.json"), $.path("out"), {
          routes: true,
          types: true,
        }).generate();
      await $.add(
        "openapi.json",
        contract({ "/Pet": ["get"], "/pet": ["get"] }),
      );
      await generate();
      const edited = `${await $.read("out/routes/Pet.ts")}// authored\n`;
      await $.add("out/routes/Pet.ts", edited);

      await $.add(
        "openapi.json",
        contract({ "/Pet": ["get"], "/pet": ["get", "post"] }),
      );
      await generate();

      const updated = await $.read("out/routes/Pet.ts");
      expect(updated.startsWith(edited.trimEnd())).toBe(true);
      expect(updated).toContain('"/pet": Routes["/pet"]["POST"]');
      expect(updated).not.toContain('"/Pet": Routes["/Pet"]["POST"]');
    });
  });

  it("moves a module from a case-variant directory without migrating it", async () => {
    await usingTemporaryFiles(async ($) => {
      // A case-insensitive file system put both routes under `reports`.
      const authored =
        'import type { Routes } from "../../types/index.js";\ntype Route = Routes["/Reports/Daily"];\nexport const GET: Route["GET"] = async () => ({ status: 204, body: "authored" });\n';
      await $.add("out/routes/reports/Daily.ts", authored);
      await $.add(
        "openapi.json",
        contract({ "/Reports/Daily": ["get"], "/reports/weekly": ["get"] }),
      );
      await new CodeGenerator($.path("openapi.json"), $.path("out"), {
        routes: true,
        types: true,
      }).generate();

      expect(await $.read("out/routes/Reports/Daily.ts")).toEqual(authored);
      expect(await $.read("out/routes/Reports/weekly.ts")).not.toContain(
        "__counterfactPaths",
      );
    });
  });

  it("attributes legacy handlers to the route named by their Route type", async () => {
    await usingTemporaryFiles(async ($) => {
      // A case-insensitive file system wrote /pet over the existing Pet.ts.
      await $.add(
        "out/routes/Pet.ts",
        'import type { Routes } from "../types/index.js";\ntype Route = Routes["/pet"];\nexport const PUT: Route["PUT"] = async () => ({ status: 204, body: "authored" });\n',
      );
      await $.add(
        "openapi.json",
        contract({ "/Pet": ["get"], "/pet": ["put"] }),
      );
      await new CodeGenerator($.path("openapi.json"), $.path("out"), {
        routes: true,
        types: true,
      }).generate();

      const shared = await $.read("out/routes/Pet.ts");
      expect(shared).toContain('"/pet": legacy1.PUT');
      expect(shared).toContain('"/Pet": Routes["/Pet"]["GET"]');
    });
  });

  it("writes middleware types under the spelling of their route directory", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "out/types/users/_.middleware.ts",
        "// This file is generated by Counterfact. Do not edit manually.\n",
      );
      await $.add("openapi.json", contract({ "/Users/{id}": ["get"] }));
      await new CodeGenerator($.path("openapi.json"), $.path("out"), {
        routes: true,
        types: true,
      }).generate();

      expect(await $.read("out/types/Users/_.middleware.ts")).toContain(
        "Middleware",
      );
    });
  });
});
