import { caseSafeOutputPaths } from "../src/case-safe-paths.js";

describe("caseSafeOutputPaths", () => {
  it("maps paths without a case-insensitive twin to themselves", () => {
    const paths = [
      "types/paths/pets.types.ts",
      "types/components/schemas/Pet.ts",
      "types/index.ts",
    ];

    expect([...caseSafeOutputPaths(paths)]).toEqual(
      expect.arrayContaining(paths.map((path) => [path, path])),
    );
  });

  it("merges directories whose names differ only by case", () => {
    const outputPaths = caseSafeOutputPaths([
      "types/paths/companies/{id}.types.ts",
      "types/paths/Companies/list.types.ts",
    ]);

    expect(outputPaths.get("types/paths/Companies/list.types.ts")).toBe(
      "types/paths/Companies/list.types.ts",
    );
    expect(outputPaths.get("types/paths/companies/{id}.types.ts")).toBe(
      "types/paths/Companies/{id}.types.ts",
    );
  });

  it("adds a numeric suffix to files whose names differ only by case", () => {
    const outputPaths = caseSafeOutputPaths([
      "types/components/schemas/OutputType.ts",
      "types/components/schemas/OutPutType.ts",
      "types/components/schemas/outputtype.ts",
    ]);

    expect(outputPaths.get("types/components/schemas/OutPutType.ts")).toBe(
      "types/components/schemas/OutPutType.ts",
    );
    expect(outputPaths.get("types/components/schemas/OutputType.ts")).toBe(
      "types/components/schemas/OutputType_2.ts",
    );
    expect(outputPaths.get("types/components/schemas/outputtype.ts")).toBe(
      "types/components/schemas/outputtype_3.ts",
    );
  });

  it("keeps the whole extension after the suffix", () => {
    const outputPaths = caseSafeOutputPaths([
      "types/paths/Pets.types.ts",
      "types/paths/pets.types.ts",
    ]);

    expect(outputPaths.get("types/paths/pets.types.ts")).toBe(
      "types/paths/pets_2.types.ts",
    );
  });

  it("keeps the name of a file that only looks like a suffixed twin", () => {
    const outputPaths = caseSafeOutputPaths([
      "schemas/A.ts",
      "schemas/a.ts",
      "schemas/a_2.ts",
    ]);

    expect(outputPaths.get("schemas/A.ts")).toBe("schemas/A.ts");
    expect(outputPaths.get("schemas/a_2.ts")).toBe("schemas/a_2.ts");
    expect(outputPaths.get("schemas/a.ts")).toBe("schemas/a_3.ts");
  });

  it("skips suffixes that a twin with another spelling already uses", () => {
    const outputPaths = caseSafeOutputPaths([
      "schemas/A.ts",
      "schemas/a.ts",
      "schemas/A_2.ts",
    ]);

    expect(outputPaths.get("schemas/A_2.ts")).toBe("schemas/A_2.ts");
    expect(outputPaths.get("schemas/a.ts")).toBe("schemas/a_3.ts");
  });

  it("does not depend on the order of the input", () => {
    const paths = [
      "types/paths/companies/{id}.types.ts",
      "types/components/schemas/OutputType.ts",
      "types/paths/Companies/list.types.ts",
      "types/components/schemas/OutPutType.ts",
    ];

    expect(caseSafeOutputPaths([...paths].reverse())).toEqual(
      caseSafeOutputPaths(paths),
    );
  });
});
