import { fileURLToPath } from "node:url";

import { describe, expect, it } from "@jest/globals";

import { usingTemporaryFiles } from "using-temporary-files";

import {
  applyOverlayActions,
  applyOverlays,
  loadOverlay,
} from "../../src/util/apply-overlay.js";

describe("applyOverlayActions", () => {
  it("merges an update into a matched node", () => {
    const document = {
      info: { title: "Original", version: "1.0.0" },
    };

    applyOverlayActions(document, [
      { target: "$.info", update: { title: "Updated" } },
    ]);

    expect(document.info.title).toBe("Updated");
    expect(document.info.version).toBe("1.0.0");
  });

  it("deep-merges nested objects", () => {
    const document: Record<string, unknown> = {
      info: {
        contact: { name: "Alice", email: "alice@example.com" },
      },
    };

    applyOverlayActions(document, [
      {
        target: "$.info",
        update: { contact: { name: "Bob" } },
      },
    ]);

    const info = document.info as { contact: { name: string; email: string } };
    expect(info.contact.name).toBe("Bob");
    expect(info.contact.email).toBe("alice@example.com");
  });

  it("removes a matched node from an object", () => {
    const document: Record<string, unknown> = {
      paths: {
        "/pets": { get: {} },
        "/users": { get: {} },
      },
    };

    applyOverlayActions(document, [
      { target: "$.paths['/pets']", remove: true },
    ]);

    const paths = document.paths as Record<string, unknown>;
    expect(paths["/pets"]).toBeUndefined();
    expect(paths["/users"]).toBeDefined();
  });

  it("applies multiple actions in order", () => {
    const document: Record<string, unknown> = {
      info: { title: "Original", description: "Keep this" },
    };

    applyOverlayActions(document, [
      { target: "$.info", update: { title: "Step 1" } },
      { target: "$.info", update: { title: "Step 2" } },
    ]);

    const info = document.info as { title: string; description: string };
    expect(info.title).toBe("Step 2");
    expect(info.description).toBe("Keep this");
  });

  it("does nothing when no nodes match the target", () => {
    const document = { info: { title: "Original" } };

    applyOverlayActions(document, [
      { target: "$.nonexistent", update: { title: "Should not apply" } },
    ]);

    expect(document.info.title).toBe("Original");
  });

  it("does not throw for an empty actions array", () => {
    const document = { info: { title: "Original" } };

    expect(() => {
      applyOverlayActions(document, []);
    }).not.toThrow();
  });

  it("ignores __proto__ keys to prevent prototype pollution", () => {
    const document: Record<string, unknown> = { info: { title: "Safe" } };

    // Simulate a malicious overlay action that tries to set __proto__
    applyOverlayActions(document, [
      {
        target: "$.info",
        update: { __proto__: { polluted: true } } as Record<string, unknown>,
      },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- checking prototype pollution
    expect((Object.prototype as any).polluted).toBeUndefined();
    expect(document.info).not.toHaveProperty("polluted");
  });

  it("adds a new key when the update introduces a property not present in target", () => {
    const document: Record<string, unknown> = { info: { title: "Original" } };

    applyOverlayActions(document, [
      { target: "$.info", update: { license: { name: "MIT" } } },
    ]);

    const info = document.info as { license?: { name: string } };
    expect(info.license?.name).toBe("MIT");
  });
});

describe("loadOverlay", () => {
  it("parses a valid YAML overlay file", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "overlay.yaml",
        [
          "overlay: 1.0.0",
          "info:",
          "  title: My Overlay",
          "  version: 1.0.0",
          "actions:",
          "  - target: $.info",
          "    update:",
          "      title: Updated Title",
        ].join("\n"),
      );

      const overlay = await loadOverlay($.path("overlay.yaml"));

      expect(overlay.actions).toHaveLength(1);
      expect(overlay.actions[0]?.target).toBe("$.info");
      expect(overlay.actions[0]?.update).toStrictEqual({
        title: "Updated Title",
      });
    });
  });

  it("parses a valid JSON overlay file", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "overlay.json",
        JSON.stringify({
          overlay: "1.0.0",
          info: { title: "JSON Overlay", version: "1.0.0" },
          actions: [{ target: "$.info", update: { title: "From JSON" } }],
        }),
      );

      const overlay = await loadOverlay($.path("overlay.json"));

      expect(overlay.actions[0]?.update?.title).toBe("From JSON");
    });
  });

  it("throws when the overlay file does not exist", async () => {
    await expect(loadOverlay("/nonexistent/overlay.yaml")).rejects.toThrow(
      "Could not read overlay file",
    );
  });

  it("throws when the overlay file is missing the 'overlay' field", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "bad.yaml",
        "actions:\n  - target: $.info\n    update:\n      title: Bad",
      );

      await expect(loadOverlay($.path("bad.yaml"))).rejects.toThrow(
        "does not appear to be a valid OpenAPI overlay file",
      );
    });
  });

  it("throws when the overlay file is missing the 'actions' field", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("bad.yaml", "overlay: 1.0.0\ninfo:\n  title: No actions");

      await expect(loadOverlay($.path("bad.yaml"))).rejects.toThrow(
        "does not appear to be a valid OpenAPI overlay file",
      );
    });
  });

  it("throws when the overlay file contains invalid YAML", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("bad.yaml", "overlay: 1.0.0\nactions: [unclosed");

      await expect(loadOverlay($.path("bad.yaml"))).rejects.toThrow(
        "Could not parse overlay file",
      );
    });
  });
});

describe("applyOverlays", () => {
  it("applies overlays from files to the document", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "overlay.yaml",
        [
          "overlay: 1.0.0",
          "info:",
          "  title: My Overlay",
          "  version: 1.0.0",
          "actions:",
          "  - target: $.info",
          "    update:",
          "      title: Applied Title",
        ].join("\n"),
      );

      const document: Record<string, unknown> = {
        info: { title: "Original", version: "1.0.0" },
      };

      await applyOverlays(document, [$.path("overlay.yaml")]);

      expect((document.info as { title: string }).title).toBe("Applied Title");
    });
  });

  it("applies multiple overlay files in order", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "overlay1.yaml",
        [
          "overlay: 1.0.0",
          "info:",
          "  title: Overlay 1",
          "  version: 1.0.0",
          "actions:",
          "  - target: $.info",
          "    update:",
          "      title: First",
        ].join("\n"),
      );

      await $.add(
        "overlay2.yaml",
        [
          "overlay: 1.0.0",
          "info:",
          "  title: Overlay 2",
          "  version: 1.0.0",
          "actions:",
          "  - target: $.info",
          "    update:",
          "      title: Second",
        ].join("\n"),
      );

      const document: Record<string, unknown> = {
        info: { title: "Original" },
      };

      await applyOverlays(document, [
        $.path("overlay1.yaml"),
        $.path("overlay2.yaml"),
      ]);

      expect((document.info as { title: string }).title).toBe("Second");
    });
  });

  it("is a no-op when overlayPaths is empty", async () => {
    const document: Record<string, unknown> = {
      info: { title: "Original" },
    };

    await applyOverlays(document, []);

    expect((document.info as { title: string }).title).toBe("Original");
  });
});

describe("fixture overlays applied to example.yaml", () => {
  const fixturesDir = fileURLToPath(
    new URL("../../test/fixtures/openapi", import.meta.url),
  );

  it("update-info.yaml patches the API title and adds contact info", async () => {
    const { Specification } =
      await import("../../src/typescript-generator/specification.js");

    const spec = await Specification.fromFile(`${fixturesDir}/example.yaml`, [
      `${fixturesDir}/overlays/update-info.yaml`,
    ]);

    const info = spec.rootRequirement.data as {
      info: { title: string; description: string; contact?: { email: string } };
    };

    expect(info.info.title).toBe("Sample API (Staging)");
    expect(info.info.description).toBe(
      "Staging environment — not for production use.",
    );
    expect(info.info.contact?.email).toBe("platform@example.com");
  });

  it("remove-deprecated.yaml removes the /legacy/items path", async () => {
    const { Specification } =
      await import("../../src/typescript-generator/specification.js");

    const spec = await Specification.fromFile(`${fixturesDir}/example.yaml`, [
      `${fixturesDir}/overlays/remove-deprecated.yaml`,
    ]);

    const paths = spec.rootRequirement.data as {
      paths: Record<string, unknown>;
    };

    expect(paths.paths["/legacy/items"]).toBeUndefined();
    // Other paths should be unaffected
    expect(paths.paths["/users"]).toBeDefined();
  });

  it("add-extensions.yaml sets x-internal on targeted operations", async () => {
    const { Specification } =
      await import("../../src/typescript-generator/specification.js");

    const spec = await Specification.fromFile(`${fixturesDir}/example.yaml`, [
      `${fixturesDir}/overlays/add-extensions.yaml`,
    ]);

    const paths = spec.rootRequirement.data as {
      paths: Record<string, { get?: Record<string, unknown> }>;
    };

    expect(paths.paths["/count"]?.get?.["x-internal"]).toBe(true);
    expect(paths.paths["/ping"]?.get?.["x-internal"]).toBe(true);
    // Unaffected operations should not have the extension
    expect(paths.paths["/users"]?.get?.["x-internal"]).toBeUndefined();
  });
});
