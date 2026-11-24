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

  it("does not reuse a suffixed name that is already taken", () => {
    const outputPaths = caseSafeOutputPaths([
      "schemas/A.ts",
      "schemas/a.ts",
      "schemas/A_2.ts",
    ]);

    expect(new Set(outputPaths.values()).size).toBe(3);
    expect(
      new Set([...outputPaths.values()].map((path) => path.toLowerCase())).size,
    ).toBe(3);
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
