import { describe, expect, it } from "@jest/globals";

import { Coder } from "../../src/typescript-generator/coder.js";
import { Repository } from "../../src/typescript-generator/repository.js";

describe("a Script", () => {
  it("responds to an import request with the name of the imported module", () => {
    const coder = new Coder({
      url: "openapi.yaml#/components/schemas/Account",
    });
    const script = new Repository("/base/path").get("script.ts");

    expect(script.import(coder)).toBe("Account");
  });

  it("does not recreate an import if a match already exists", () => {
    const script = new Repository("/base/path").get("script.ts");

    class AccountCoder extends Coder {}

    class AccountTypeCoder extends Coder {}

    const mockRequirement = {
      url: "openapi.yaml#/components/schemas/Account",
    };

    const coder1 = new AccountCoder(mockRequirement);
    const coder2 = new AccountCoder(mockRequirement);
    const coder3 = new AccountTypeCoder(mockRequirement);
    const coder4 = new AccountCoder({
      url: "/different/url/ending/in/Account",
    });

    const coder5 = new AccountTypeCoder(mockRequirement);

    expect(script.import(coder1)).toBe("Account");
    expect(script.import(coder2)).toBe("Account");
    expect(script.import(coder3)).toBe("Account2");
    expect(script.import(coder4)).toBe("Account3");
    expect(script.import(coder5)).toBe("Account2");
  });

  it("when asked to import, registers an export on the target script", () => {
    const repository = new Repository("/base/path");

    class CoderThatWantsToImportAccount extends Coder {
      *names() {
        yield "Account";
      }

      modulePath() {
        return "export-from-me.ts";
      }
    }

    const coder = new CoderThatWantsToImportAccount({});

    const importingScript = repository.get("import-to-me.ts");
    const exportingScript = repository.get("export-from-me.ts");

    importingScript.import(coder);

    expect(importingScript.imports.get("Account")).toStrictEqual({
      isDefault: false,
      isType: false,
      name: "Account",
      script: exportingScript,
    });
  });

  it("creates import statements", () => {
    const repository = new Repository("/base/path");

    class CoderThatWantsToImportAccount extends Coder {
      *names() {
        let index = 0;

        while (true) {
          yield `Account${index}`;
          index += 1;
        }
      }

      modulePath() {
        return "export-from-me.ts";
      }
    }

    const coder = new CoderThatWantsToImportAccount({});

    const script = repository.get("import-to-me.ts");

    script.import(coder);
    script.importType(coder);
    script.importDefault(coder);

    script.importExternalType("ResponseBuilderFactory", "file.ts");

    expect(script.importStatements()).toStrictEqual([
      'import { Account0 } from "./export-from-me.js";',
      'import type { Account1 } from "./export-from-me.js";',
      'import Account2 from "./export-from-me.js";',
    ]);
  });

  it("escapes colons in import paths (routes with colons like /stuff:action)", () => {
    const repository = new Repository("/base/path");

    class CoderWithColonPath extends Coder {
      *names() {
        yield "stuffAction";
      }

      modulePath() {
        return "types/paths/stuff:action.types.ts";
      }
    }

    const coder = new CoderWithColonPath({});

    const script = repository.get("routes/stuff:action.ts");

    script.importType(coder);

    expect(script.importStatements()).toStrictEqual([
      'import type { stuffAction } from "../types/paths/stuff∶action.types.js";',
    ]);
  });

  it("creates external import statements", () => {
    const repository = new Repository("/base/path");

    const script = repository.get("import-to-me.ts");

    script.importExternal("SomeClass", "code.ts");
    script.importExternalType("SomeType", "type.ts");

    expect(script.externalImportStatements()).toStrictEqual([
      'import { SomeClass } from "code.ts";',
      'import type { SomeType } from "type.ts";',
    ]);
  });

  it("creates import statements for shared types", () => {
    const repository = new Repository("/base/path");

    const script1 = repository.get("paths/import-to-me.ts");
    const script2 = repository.get("paths/sub/sub/import-to-me.ts");

    script1.importSharedType("SomeType");
    script2.importSharedType("SomeType");

    expect(script1.externalImportStatements()).toStrictEqual([
      'import type { SomeType } from "../counterfact-types/index.ts";',
    ]);

    expect(script2.externalImportStatements()).toStrictEqual([
      'import type { SomeType } from "../../../counterfact-types/index.ts";',
    ]);
  });

  it("handles relative import statements", () => {
    const repository = new Repository("/base/path");

    class CoderThatWantsToImportAccount extends Coder {
      *names() {
        let index = 0;

        while (true) {
          yield `Account${index}`;
          index += 1;
        }
      }

      modulePath() {
        return "../../export-from-me.ts";
      }
    }

    const coder = new CoderThatWantsToImportAccount({});

    const script = repository.get("import-to-me.ts");

    script.import(coder);
    script.importType(coder);
    script.importDefault(coder);

    expect(script.importStatements()).toStrictEqual([
      'import { Account0 } from "../../export-from-me.js";',
      'import type { Account1 } from "../../export-from-me.js";',
      'import Account2 from "../../export-from-me.js";',
    ]);
  });

  it("creates export statements", async () => {
    const repository = new Repository("/base/path");

    class AccountCoder extends Coder {
      *names() {
        yield "Account";
      }

      write() {
        return "{ }";
      }
    }

    class AccountTypeCoder extends Coder {
      *names() {
        yield "AccountType";
      }

      write() {
        return "{ }";
      }
    }

    const script = repository.get("export-to-me.ts");

    script.export(new AccountCoder({}));
    script.exportType(new AccountTypeCoder({}));

    await script.finished();

    expect(script.exportStatements()).toStrictEqual([
      "export const Account = { };",
      "export type AccountType = { };",
    ]);
  });

  it("outputs the contents (import and export statements)", async () => {
    const repository = new Repository("/base/path");

    const script = repository.get("script.ts");

    script.comments = ["This is a comment."];

    script.importStatements = () => ["import { foo } from './foo.js';"];

    script.exportStatements = () => [
      'export const bar = "Bar";',
      "export default class {};",
    ];

    await expect(script.contents()).resolves.toBe(
      '// This is a comment.\n\nimport { foo } from "./foo.js";\n\nexport const bar = "Bar";\n\nexport default class {}\n',
    );
  });
});
