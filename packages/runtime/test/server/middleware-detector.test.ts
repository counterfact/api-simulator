import type { Module } from "../../src/server/registry.js";
import {
  isContextModule,
  isMiddlewareModule,
} from "../../src/server/middleware-detector.js";

describe("isContextModule", () => {
  it("returns true when the module exports a Context constructor", () => {
    expect(isContextModule({ Context: class {} } as unknown as Module)).toBe(
      true,
    );
  });

  it("returns false when Context is not a function", () => {
    expect(
      isContextModule({ Context: "not-a-function" } as unknown as Module),
    ).toBe(false);
  });

  it("returns false when Context is absent", () => {
    expect(isContextModule({ GET: () => ({ status: 200 }) })).toBe(false);
  });
});

describe("isMiddlewareModule", () => {
  it("returns true when the module exports a middleware function as own property", () => {
    expect(
      isMiddlewareModule({ middleware: () => {} } as unknown as Module),
    ).toBe(true);
  });

  it("returns false when middleware is not a function", () => {
    expect(
      isMiddlewareModule({ middleware: "not-a-function" } as unknown as Module),
    ).toBe(false);
  });

  it("returns false when middleware is absent", () => {
    expect(isMiddlewareModule({ GET: () => ({ status: 200 }) })).toBe(false);
  });

  it("returns false when middleware is inherited but not an own property", () => {
    const base = { middleware: () => {} };
    const derived = Object.create(base) as object;
    expect(isMiddlewareModule(derived as unknown as Module)).toBe(false);
  });
});
