import { describe, expect, it } from "@jest/globals";

import { generateVersionsTsContent } from "../../src/typescript-generator/versions-ts-generator.js";

describe("generateVersionsTsContent", () => {
  it("returns an empty string for an empty versions array", async () => {
    await expect(generateVersionsTsContent([])).resolves.toBe("");
  });

  it("generates Versions union for a single version", async () => {
    const content = await generateVersionsTsContent(["v1"]);
    expect(content).toContain('export type Versions = "v1"');
  });

  it("generates Versions union for two versions in declaration order", async () => {
    const content = await generateVersionsTsContent(["v1", "v2"]);
    expect(content).toContain('export type Versions = "v1" | "v2"');
  });

  it("generates Versions union for three versions in declaration order", async () => {
    const content = await generateVersionsTsContent(["v1", "v2", "v3"]);
    expect(content).toContain('export type Versions = "v1" | "v2" | "v3"');
  });

  it("generates VersionsGTE with only itself for a single version", async () => {
    const content = await generateVersionsTsContent(["v1"]);
    expect(content).toContain('v1: "v1"');
  });

  it("generates correct VersionsGTE for two versions", async () => {
    const content = await generateVersionsTsContent(["v1", "v2"]);
    // v1 >= v1, v2; v2 >= v2 only
    expect(content).toContain('v1: "v1" | "v2"');
    expect(content).toContain('v2: "v2"');
  });

  it("generates correct VersionsGTE for three versions", async () => {
    const content = await generateVersionsTsContent(["v1", "v2", "v3"]);
    expect(content).toContain('v1: "v1" | "v2" | "v3"');
    expect(content).toContain('v2: "v2" | "v3"');
    expect(content).toContain('v3: "v3"');
  });

  it("exports the Versioned utility type", async () => {
    const content = await generateVersionsTsContent(["v1", "v2"]);
    expect(content).toContain("export type Versioned<");
    expect(content).toContain("version: V");
    expect(content).toContain("minVersion<M extends keyof T & Versions>");
  });

  it("exports the VersionsGTE type", async () => {
    const content = await generateVersionsTsContent(["v1", "v2"]);
    expect(content).toContain("export type VersionsGTE");
  });

  it("does not throw when generating content for multiple versions", async () => {
    await expect(
      generateVersionsTsContent(["v1", "v2", "v3"]),
    ).resolves.not.toThrow();
  });

  it("includes the auto-generated comment header", async () => {
    const content = await generateVersionsTsContent(["v1"]);
    expect(content).toContain("auto-generated");
  });
});
