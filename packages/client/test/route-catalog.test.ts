import { describe, expect, it } from "@jest/globals";

import { createOpenApiRouteCatalog } from "../src/index.js";

describe("createOpenApiRouteCatalog", () => {
  it("lists document paths", () => {
    const catalog = createOpenApiRouteCatalog({
      paths: { "/pets": { get: {} }, "/users": { post: {} } },
    });

    expect(catalog.listPaths()).toEqual(["/pets", "/users"]);
  });

  it("resolves paths and methods case-insensitively", () => {
    const operation = { summary: "Find a pet" };
    const catalog = createOpenApiRouteCatalog({
      paths: { "/Pets/{petId}": { get: operation } },
    });

    expect(catalog.getOperation("/PETS/{PETID}", "GET")).toBe(operation);
  });

  it("returns undefined for an unknown path or method", () => {
    const catalog = createOpenApiRouteCatalog({
      paths: { "/pets": { get: {} } },
    });

    expect(catalog.getOperation("/users", "get")).toBeUndefined();
    expect(catalog.getOperation("/pets", "post")).toBeUndefined();
  });

  it("merges path-item parameters with operation parameters", () => {
    const catalog = createOpenApiRouteCatalog({
      paths: {
        "/pets/{petId}": {
          get: {
            parameters: [
              {
                in: "header",
                name: "x-token",
                required: false,
                type: "string",
              },
            ],
          },
          parameters: [
            {
              in: "path",
              name: "petId",
              required: true,
              type: "string",
            },
            {
              in: "header",
              name: "x-token",
              required: true,
              type: "string",
            },
          ],
        },
      },
    });

    expect(catalog.getOperation("/pets/{petId}", "get")?.parameters).toEqual([
      {
        in: "path",
        name: "petId",
        required: true,
        type: "string",
      },
      {
        in: "header",
        name: "x-token",
        required: false,
        type: "string",
      },
    ]);
  });

  it("uses document-level consumes unless the operation overrides it", () => {
    const catalog = createOpenApiRouteCatalog({
      consumes: ["application/x-www-form-urlencoded"],
      paths: {
        "/default": { post: {} },
        "/multipart": {
          post: { consumes: ["multipart/form-data"] },
        },
      },
    });

    expect(catalog.getOperation("/default", "post")?.consumes).toEqual([
      "application/x-www-form-urlencoded",
    ]);
    expect(catalog.getOperation("/multipart", "post")?.consumes).toEqual([
      "multipart/form-data",
    ]);
  });

  it("reads a live document instead of snapshotting it", () => {
    const document = {
      paths: { "/pets": { get: {} } } as Record<string, object>,
    };
    const catalog = createOpenApiRouteCatalog(document);

    document.paths = { "/users": { get: { summary: "Users" } } };

    expect(catalog.listPaths()).toEqual(["/users"]);
    expect(catalog.getOperation("/users", "get")?.summary).toBe("Users");
  });
});
