import { usingTemporaryFiles } from "using-temporary-files";

import { CodeGenerator } from "../src/code-generator.js";
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
  it("keeps exact paths for singleton uppercase routes and coalesces disjoint methods", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.json",
        contract({
          "/Pet": ["get"],
          "/pet": ["post"],
          "/Reports/Daily": ["get"],
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
      expect(singleton).toContain('["/Reports/Daily"]');
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

  it("selects the first spelling separately for each directory and file", () => {
    const layout = new CaseLayout();
    expect(layout.file("routes/PetModels/ItemById.ts")).toBe(
      "routes/PetModels/ItemById.ts",
    );
    expect(layout.file("routes/petmodels/itembyid.ts")).toBe(
      "routes/PetModels/ItemById.ts",
    );
    expect(layout.file("routes/PETMODELS/OtherItem.ts")).toBe(
      "routes/PetModels/OtherItem.ts",
    );
  });
});
