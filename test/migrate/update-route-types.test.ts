import { describe, expect, it } from "@jest/globals";

import { usingTemporaryFiles } from "using-temporary-files";

// Import the main function - other functions are not exported so we test through integration
import { updateRouteTypes } from "../../src/migrate/update-route-types.js";

describe("update-route-types migration", () => {
  describe("basic migration scenarios", () => {
    it("migrates HTTP_GET to operationId-based type name", async () => {
      const openApiSpec = {
        openapi: "3.0.0",
        paths: {
          "/pet/{id}": {
            get: {
              operationId: "getPetById",
              parameters: [
                {
                  in: "path",
                  name: "id",
                  schema: { type: "string" },
                },
              ],
              responses: {
                200: {
                  description: "Success",
                },
              },
            },
          },
        },
      };

      const routeFile = `import type { HTTP_GET } from "../types/paths/pet/{id}.types.ts";

export const GET: HTTP_GET = ($) => {
  return { status: 200 };
};
`;

      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(openApiSpec));
        await $.add("routes/pet/{id}.ts", routeFile);
        const migrated = await updateRouteTypes(
          $.path(""),
          $.path("openapi.json"),
        );

        expect(migrated).toBe(true);

        const updatedContent = await $.read("routes/pet/{id}.ts");

        expect(updatedContent).toContain("import type { getPetById }");
        expect(updatedContent).toContain("export const GET: getPetById");
        expect(updatedContent).not.toContain("HTTP_GET");
      });
    });

    it("migrates HTTP_POST to operationId-based type name", async () => {
      const openApiSpec = {
        openapi: "3.0.0",
        paths: {
          "/pet": {
            post: {
              operationId: "addPet",
              requestBody: {
                content: {
                  "application/json": {
                    schema: { type: "object" },
                  },
                },
              },
              responses: {
                201: {
                  description: "Created",
                },
              },
            },
          },
        },
      };

      const routeFile = `import type { HTTP_POST } from "../types/paths/pet.types.ts";

export const POST: HTTP_POST = ($) => {
  return { status: 201 };
};
`;

      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(openApiSpec));
        await $.add("routes/pet.ts", routeFile);
        const migrated = await updateRouteTypes(
          $.path(""),
          $.path("openapi.json"),
        );

        expect(migrated).toBe(true);

        const updatedContent = await $.read("routes/pet.ts");

        expect(updatedContent).toContain("import type { addPet }");
        expect(updatedContent).toContain("export const POST: addPet");
        expect(updatedContent).not.toContain("HTTP_POST");
      });
    });

    it("migrates HTTP_QUERY to operationId-based type name", async () => {
      const openApiSpec = {
        openapi: "3.2.0",
        paths: {
          "/search": {
            query: {
              operationId: "searchItems",
              requestBody: {
                content: {
                  "application/json": {
                    schema: { type: "object" },
                  },
                },
              },
              responses: {
                200: {
                  description: "Success",
                },
              },
            },
          },
        },
      };

      const routeFile = `import type { HTTP_QUERY } from "../types/paths/search.types.ts";

export const QUERY: HTTP_QUERY = ($) => {
  return { status: 200 };
};
`;

      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(openApiSpec));
        await $.add("routes/search.ts", routeFile);
        const migrated = await updateRouteTypes(
          $.path(""),
          $.path("openapi.json"),
        );

        expect(migrated).toBe(true);

        const updatedContent = await $.read("routes/search.ts");

        expect(updatedContent).toContain("import type { searchItems }");
        expect(updatedContent).toContain("export const QUERY: searchItems");
        expect(updatedContent).not.toContain("HTTP_QUERY");
      });
    });

    it("migrates multiple HTTP methods in the same file", async () => {
      const openApiSpec = {
        openapi: "3.0.0",
        paths: {
          "/pet/{id}": {
            get: {
              operationId: "getPetById",
              responses: { 200: { description: "Success" } },
            },
            put: {
              operationId: "updatePet",
              responses: { 200: { description: "Updated" } },
            },
            delete: {
              operationId: "deletePet",
              responses: { 204: { description: "Deleted" } },
            },
          },
        },
      };

      const routeFile = `import type { HTTP_GET, HTTP_PUT, HTTP_DELETE } from "../types/paths/pet/{id}.types.ts";

export const GET: HTTP_GET = ($) => {
  return { status: 200 };
};

export const PUT: HTTP_PUT = ($) => {
  return { status: 200 };
};

export const DELETE: HTTP_DELETE = ($) => {
  return { status: 204 };
};
`;

      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(openApiSpec));
        await $.add("routes/pet/{id}.ts", routeFile);
        const migrated = await updateRouteTypes(
          $.path(""),
          $.path("openapi.json"),
        );

        expect(migrated).toBe(true);

        const updatedContent = await $.read("routes/pet/{id}.ts");

        expect(updatedContent).toContain(
          "import type { getPetById, updatePet, deletePet }",
        );
        expect(updatedContent).toContain("export const GET: getPetById");
        expect(updatedContent).toContain("export const PUT: updatePet");
        expect(updatedContent).toContain("export const DELETE: deletePet");
        expect(updatedContent).not.toContain("HTTP_GET");
        expect(updatedContent).not.toContain("HTTP_PUT");
        expect(updatedContent).not.toContain("HTTP_DELETE");
      });
    });

    it("handles root path route", async () => {
      const openApiSpec = {
        openapi: "3.0.0",
        paths: {
          "/": {
            get: {
              operationId: "getRoot",
              responses: { 200: { description: "Success" } },
            },
          },
        },
      };

      const routeFile = `import type { HTTP_GET } from "../types/paths/index.types.ts";

export const GET: HTTP_GET = ($) => {
  return { status: 200 };
};
`;

      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(openApiSpec));
        await $.add("routes/index.ts", routeFile);
        const migrated = await updateRouteTypes(
          $.path(""),
          $.path("openapi.json"),
        );

        expect(migrated).toBe(true);

        const updatedContent = await $.read("routes/index.ts");

        expect(updatedContent).toContain("import type { getRoot }");
        expect(updatedContent).toContain("export const GET: getRoot");
      });
    });

    it("keeps HTTP_METHOD when no operationId is present", async () => {
      const openApiSpec = {
        openapi: "3.0.0",
        paths: {
          "/anonymous": {
            get: {
              responses: { 200: { description: "Success" } },
            },
          },
        },
      };

      const routeFile = `import type { HTTP_GET } from "../types/paths/anonymous.types.ts";

export const GET: HTTP_GET = ($) => {
  return { status: 200 };
};
`;

      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(openApiSpec));
        await $.add("routes/anonymous.ts", routeFile);
        const migrated = await updateRouteTypes(
          $.path(""),
          $.path("openapi.json"),
        );

        // Should return false because no changes needed (HTTP_GET stays HTTP_GET)
        expect(migrated).toBe(false);

        const updatedContent = await $.read("routes/anonymous.ts");

        // File should remain unchanged
        expect(updatedContent).toContain("import type { HTTP_GET }");
        expect(updatedContent).toContain("export const GET: HTTP_GET");
      });
    });
  });

  describe("nested routes", () => {
    it("migrates routes in nested directories", async () => {
      const openApiSpec = {
        openapi: "3.0.0",
        paths: {
          "/api/v1/users/{id}": {
            get: {
              operationId: "getUserById",
              responses: { 200: { description: "Success" } },
            },
          },
        },
      };

      const routeFile = `import type { HTTP_GET } from "../../../types/paths/api/v1/users/{id}.types.ts";

export const GET: HTTP_GET = ($) => {
  return { status: 200 };
};
`;

      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(openApiSpec));
        await $.add("routes/api/v1/users/{id}.ts", routeFile);
        const migrated = await updateRouteTypes(
          $.path(""),
          $.path("openapi.json"),
        );

        expect(migrated).toBe(true);

        const updatedContent = await $.read("routes/api/v1/users/{id}.ts");

        expect(updatedContent).toContain("import type { getUserById }");
        expect(updatedContent).toContain("export const GET: getUserById");
      });
    });

    it("processes multiple files across different directories", async () => {
      const openApiSpec = {
        openapi: "3.0.0",
        paths: {
          "/pets": {
            get: {
              operationId: "listPets",
              responses: { 200: { description: "Success" } },
            },
          },
          "/pets/{id}": {
            get: {
              operationId: "getPetById",
              responses: { 200: { description: "Success" } },
            },
          },
          "/users": {
            get: {
              operationId: "listUsers",
              responses: { 200: { description: "Success" } },
            },
          },
        },
      };

      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(openApiSpec));
        await $.add(
          "routes/pets.ts",
          `import type { HTTP_GET } from "../types/paths/pets.types.ts";
export const GET: HTTP_GET = ($) => ({ status: 200 });`,
        );
        await $.add(
          "routes/pets/{id}.ts",
          `import type { HTTP_GET } from "../types/paths/pets/{id}.types.ts";
export const GET: HTTP_GET = ($) => ({ status: 200 });`,
        );
        await $.add(
          "routes/users.ts",
          `import type { HTTP_GET } from "../types/paths/users.types.ts";
export const GET: HTTP_GET = ($) => ({ status: 200 });`,
        );
        const migrated = await updateRouteTypes(
          $.path(""),
          $.path("openapi.json"),
        );

        expect(migrated).toBe(true);

        const petsContent = await $.read("routes/pets.ts");
        expect(petsContent).toContain("import type { listPets }");
        expect(petsContent).toContain("export const GET: listPets");

        const petByIdContent = await $.read("routes/pets/{id}.ts");
        expect(petByIdContent).toContain("import type { getPetById }");
        expect(petByIdContent).toContain("export const GET: getPetById");

        const usersContent = await $.read("routes/users.ts");
        expect(usersContent).toContain("import type { listUsers }");
        expect(usersContent).toContain("export const GET: listUsers");
      });
    });
  });

  describe("idempotency", () => {
    it("does not modify files that have already been migrated", async () => {
      const openApiSpec = {
        openapi: "3.0.0",
        paths: {
          "/pet/{id}": {
            get: {
              operationId: "getPetById",
              responses: { 200: { description: "Success" } },
            },
          },
        },
      };

      const alreadyMigratedFile = `import type { getPetById } from "../types/paths/pet/{id}.types.ts";

export const GET: getPetById = ($) => {
  return { status: 200 };
};
`;

      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(openApiSpec));
        await $.add("routes/pet/{id}.ts", alreadyMigratedFile);
        const migrated = await updateRouteTypes(
          $.path(""),
          $.path("openapi.json"),
        );

        // Should return false because file is already migrated
        expect(migrated).toBe(false);

        const updatedContent = await $.read("routes/pet/{id}.ts");

        // File should remain exactly the same
        expect(updatedContent).toBe(alreadyMigratedFile);
      });
    });

    it("can be run multiple times without issues", async () => {
      const openApiSpec = {
        openapi: "3.0.0",
        paths: {
          "/pet": {
            post: {
              operationId: "addPet",
              responses: { 201: { description: "Created" } },
            },
          },
        },
      };

      const routeFile = `import type { HTTP_POST } from "../types/paths/pet.types.ts";

export const POST: HTTP_POST = ($) => {
  return { status: 201 };
};
`;

      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(openApiSpec));
        await $.add("routes/pet.ts", routeFile);
        // First migration
        const firstMigration = await updateRouteTypes(
          $.path(""),
          $.path("openapi.json"),
        );
        expect(firstMigration).toBe(true);

        const afterFirstMigration = await $.read("routes/pet.ts");

        // Second migration
        const secondMigration = await updateRouteTypes(
          $.path(""),
          $.path("openapi.json"),
        );
        expect(secondMigration).toBe(false);

        const afterSecondMigration = await $.read("routes/pet.ts");

        // Content should be identical after both runs
        expect(afterFirstMigration).toBe(afterSecondMigration);
        expect(afterSecondMigration).toContain("import type { addPet }");
      });
    });
  });

  describe("edge cases", () => {
    it("skips _.context.ts files", async () => {
      const openApiSpec = {
        openapi: "3.0.0",
        paths: {
          "/pet": {
            get: {
              operationId: "listPets",
              responses: { 200: { description: "Success" } },
            },
          },
        },
      };

      const contextFile = `export interface Context {
  // HTTP_GET should not be touched in context files
}
`;

      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(openApiSpec));
        await $.add(
          "routes/pet.ts",
          `import type { HTTP_GET } from "../types/paths/pet.types.ts";
export const GET: HTTP_GET = ($) => ({ status: 200 });`,
        );
        await $.add("routes/_.context.ts", contextFile);
        await updateRouteTypes($.path(""), $.path("openapi.json"));

        const contextContent = await $.read("routes/_.context.ts");

        // Context file should remain unchanged
        expect(contextContent).toBe(contextFile);
      });
    });

    it("returns false when no routes directory exists", async () => {
      await usingTemporaryFiles(async ($) => {
        await $.add(
          "openapi.json",
          JSON.stringify({
            openapi: "3.0.0",
            paths: {},
          }),
        );
        const migrated = await updateRouteTypes(
          $.path(""),
          $.path("openapi.json"),
        );

        expect(migrated).toBe(false);
      });
    });

    it("returns false when openApiPath is '_'", async () => {
      await usingTemporaryFiles(async ($) => {
        const migrated = await updateRouteTypes($.path(""), "_");

        expect(migrated).toBe(false);
      });
    });

    it("handles files without HTTP_ imports gracefully", async () => {
      const openApiSpec = {
        openapi: "3.0.0",
        paths: {
          "/pet": {
            get: {
              operationId: "listPets",
              responses: { 200: { description: "Success" } },
            },
          },
        },
      };

      const nonMigrationFile = `// Some other file without HTTP_ imports

export const config = {
  enabled: true
};
`;

      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(openApiSpec));
        await $.add("routes/config.ts", nonMigrationFile);
        const migrated = await updateRouteTypes(
          $.path(""),
          $.path("openapi.json"),
        );

        expect(migrated).toBe(false);

        const content = await $.read("routes/config.ts");
        expect(content).toBe(nonMigrationFile);
      });
    });

    it("handles import statements with various whitespace formats", async () => {
      const openApiSpec = {
        openapi: "3.0.0",
        paths: {
          "/pet": {
            get: {
              operationId: "getPet",
              responses: { 200: { description: "Success" } },
            },
            post: {
              operationId: "addPet",
              responses: { 201: { description: "Created" } },
            },
          },
        },
      };

      const routeFile = `import type {HTTP_GET,   HTTP_POST  } from "../types/paths/pet.types.ts";

export const GET:HTTP_GET = ($) => {
  return { status: 200 };
};

export const POST : HTTP_POST= ($) => {
  return { status: 201 };
};
`;

      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(openApiSpec));
        await $.add("routes/pet.ts", routeFile);
        const migrated = await updateRouteTypes(
          $.path(""),
          $.path("openapi.json"),
        );

        expect(migrated).toBe(true);

        const updatedContent = await $.read("routes/pet.ts");

        expect(updatedContent).toContain("getPet");
        expect(updatedContent).toContain("addPet");
        expect(updatedContent).not.toContain("HTTP_GET");
        expect(updatedContent).not.toContain("HTTP_POST");
      });
    });

    it("handles all HTTP methods", async () => {
      const openApiSpec = {
        openapi: "3.0.0",
        paths: {
          "/resource": {
            get: {
              operationId: "getResource",
              responses: { 200: { description: "Success" } },
            },
            post: {
              operationId: "createResource",
              responses: { 201: { description: "Created" } },
            },
            put: {
              operationId: "updateResource",
              responses: { 200: { description: "Updated" } },
            },
            patch: {
              operationId: "patchResource",
              responses: { 200: { description: "Patched" } },
            },
            delete: {
              operationId: "deleteResource",
              responses: { 204: { description: "Deleted" } },
            },
            head: {
              operationId: "headResource",
              responses: { 200: { description: "OK" } },
            },
            options: {
              operationId: "optionsResource",
              responses: { 200: { description: "OK" } },
            },
          },
        },
      };

      const routeFile = `import type { HTTP_GET, HTTP_POST, HTTP_PUT, HTTP_PATCH, HTTP_DELETE, HTTP_HEAD, HTTP_OPTIONS } from "../types/paths/resource.types.ts";

export const GET: HTTP_GET = ($) => ({ status: 200 });
export const POST: HTTP_POST = ($) => ({ status: 201 });
export const PUT: HTTP_PUT = ($) => ({ status: 200 });
export const PATCH: HTTP_PATCH = ($) => ({ status: 200 });
export const DELETE: HTTP_DELETE = ($) => ({ status: 204 });
export const HEAD: HTTP_HEAD = ($) => ({ status: 200 });
export const OPTIONS: HTTP_OPTIONS = ($) => ({ status: 200 });
`;

      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(openApiSpec));
        await $.add("routes/resource.ts", routeFile);
        const migrated = await updateRouteTypes(
          $.path(""),
          $.path("openapi.json"),
        );

        expect(migrated).toBe(true);

        const updatedContent = await $.read("routes/resource.ts");

        expect(updatedContent).toContain("getResource");
        expect(updatedContent).toContain("createResource");
        expect(updatedContent).toContain("updateResource");
        expect(updatedContent).toContain("patchResource");
        expect(updatedContent).toContain("deleteResource");
        expect(updatedContent).toContain("headResource");
        expect(updatedContent).toContain("optionsResource");

        // Verify none of the old names remain
        expect(updatedContent).not.toContain("HTTP_GET");
        expect(updatedContent).not.toContain("HTTP_POST");
        expect(updatedContent).not.toContain("HTTP_PUT");
        expect(updatedContent).not.toContain("HTTP_PATCH");
        expect(updatedContent).not.toContain("HTTP_DELETE");
        expect(updatedContent).not.toContain("HTTP_HEAD");
        expect(updatedContent).not.toContain("HTTP_OPTIONS");
      });
    });
  });

  describe("error handling", () => {
    it("handles invalid OpenAPI spec gracefully", async () => {
      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", "{ invalid json");
        await $.add(
          "routes/pet.ts",
          `import type { HTTP_GET } from "../types/paths/pet.types.ts";
export const GET: HTTP_GET = ($) => ({ status: 200 });`,
        );
        // Should not throw, should return false
        const migrated = await updateRouteTypes(
          $.path(""),
          $.path("openapi.json"),
        );

        expect(migrated).toBe(false);
      });
    });

    it("handles spec with no paths", async () => {
      const openApiSpec = {
        openapi: "3.0.0",
        info: { title: "Test", version: "1.0.0" },
      };

      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(openApiSpec));
        await $.add(
          "routes/pet.ts",
          `import type { HTTP_GET } from "../types/paths/pet.types.ts";
export const GET: HTTP_GET = ($) => ({ status: 200 });`,
        );
        const migrated = await updateRouteTypes(
          $.path(""),
          $.path("openapi.json"),
        );

        expect(migrated).toBe(false);
      });
    });
  });
});
