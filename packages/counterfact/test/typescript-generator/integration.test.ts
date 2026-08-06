import { describe, expect, it } from "@jest/globals";

import { Coder } from "../../src/typescript-generator/coder.js";
import { Repository } from "../../src/typescript-generator/repository.js";
import { Specification } from "../../src/typescript-generator/specification.js";
import { Requirement } from "../../src/typescript-generator/requirement.js";

describe("integration Test", () => {
  it("writes some code", async () => {
    const specification = new Specification(
      new Requirement({
        paths: {
          "/accounts": {
            get: {},
            post: {},
          },

          "/accounts/{id}": {
            get: {},
            put: {},
          },
        },
      }),
    );

    const repository = new Repository();
    const requirement = await specification.getRequirement("#/paths");

    class OperationCoder extends Coder {
      *names() {
        yield `HTTP_${this.requirement.url.split("/").at(-1).toUpperCase()}`;
      }

      write() {
        return "() => {}";
      }
    }

    requirement.forEach((pathDefinition, key) => {
      pathDefinition.forEach((operation) => {
        repository.get(`paths${key}.ts`).export(new OperationCoder(operation));
      });
    });

    const account = repository.get("paths/accounts.ts");
    const accountId = repository.get("paths/accounts/{id}.ts");

    await account.finished();

    await expect(account.contents()).resolves.toBe(
      "export const HTTP_GET = () => {};\n\nexport const HTTP_POST = () => {};\n",
    );
    await expect(accountId.contents()).resolves.toBe(
      "export const HTTP_GET = () => {};\n\nexport const HTTP_PUT = () => {};\n",
    );
  });
});
