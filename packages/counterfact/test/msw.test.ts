/* eslint-disable @typescript-eslint/no-explicit-any */
import * as msw from "../src/msw";
import { Registry } from "../src/server/registry";

// Minimal valid mock Config
const mockConfig = {
  openApiPath: "_",
  basePath: ".",
  port: 1234,
  alwaysFakeOptionals: false,
  generate: { routes: false, types: false },
  proxyPaths: new Map(),
  proxyUrl: "",
  startAdminApi: false,
  startRepl: false,
  startServer: false,
  watch: { routes: false, types: false },
  prefix: "",
};

// Minimal valid mock MockRequest
const mockRequest = {
  method: "get",
  rawPath: "/foo",
  body: undefined,
  headers: {},
  path: "/foo",
  query: {},
  req: {},
};

class MockModuleLoader {
  private registry: any;
  constructor(basePath: string, registry: Registry) {
    this.registry = registry;
  }
  async load() {
    // Register a mock route in the registry for GET /foo
    this.registry.add("/foo", {
      get: async () => ({ ok: true }),
    });
  }
  async watch() {}
  async stopWatching() {}
}

describe("handleMswRequest", () => {
  it("returns 404 if no handler exists", async () => {
    const result = await (msw as any).handleMswRequest(mockRequest);
    expect(result).toEqual({
      error: "No handler found for get /foo",
      status: 404,
    });
  });

  it("calls the correct handler if present", async () => {
    await (msw as any).createMswHandlers(
      {
        ...mockConfig,
        openApiPath: "test/fixtures/openapi/example.yaml",
      },
      MockModuleLoader,
    );
    const result = await (msw as any).handleMswRequest(mockRequest);
    expect(result).toBeDefined();
    expect(result.ok).toBe(true);
  });
});

describe("createMswHandlers", () => {
  it("throws if openApiDocument is undefined", async () => {
    await expect(
      (msw as any).createMswHandlers(
        {
          ...mockConfig,
          openApiPath: "nonexistent.yaml",
        },
        MockModuleLoader,
      ),
    ).rejects.toThrow();
  });

  it("returns handlers for valid openApiDocument", async () => {
    const handlers = await (msw as any).createMswHandlers(
      {
        ...mockConfig,
        openApiPath: "test/fixtures/openapi/example.yaml",
      },
      MockModuleLoader,
    );
    expect(Array.isArray(handlers)).toBe(true);
    expect(handlers.length).toBeGreaterThan(0);
    expect(handlers[0]).toHaveProperty("method");
    expect(handlers[0]).toHaveProperty("path");
  });
});
