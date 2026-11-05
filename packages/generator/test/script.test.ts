import ts from "typescript";
import {
  importDeclaration,
  stringType,
  typeLiteral,
  typeProperty,
  valueExpression,
  printNode,
} from "../src/ast.js";
import { describe, expect, it } from "@jest/globals";

import { Coder } from "../src/coder.js";
import { Repository } from "../src/repository.js";

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
      id: coder.exportId,
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

    expect(script.importStatements().map(printNode)).toStrictEqual([
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

    expect(script.importStatements().map(printNode)).toStrictEqual([
      'import type { stuffAction } from "../types/paths/stuff∶action.types.js";',
    ]);
  });

  it("creates external import statements", () => {
    const repository = new Repository("/base/path");

    const script = repository.get("import-to-me.ts");

    script.importExternal("SomeClass", "code.ts");
    script.importExternalType("SomeType", "type.ts");

    expect(script.externalImportStatements().map(printNode)).toStrictEqual([
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

    expect(script1.externalImportStatements().map(printNode)).toStrictEqual([
      'import type { SomeType } from "../counterfact-types/index.ts";',
    ]);

    expect(script2.externalImportStatements().map(printNode)).toStrictEqual([
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
        return "types/export-from-me.ts";
      }
    }

    const coder = new CoderThatWantsToImportAccount({});

    const script = repository.get("routes/nested/import-to-me.ts");

    script.import(coder);
    script.importType(coder);
    script.importDefault(coder);

    expect(script.importStatements().map(printNode)).toStrictEqual([
      'import { Account0 } from "../../types/export-from-me.js";',
      'import type { Account1 } from "../../types/export-from-me.js";',
      'import Account2 from "../../types/export-from-me.js";',
    ]);
  });

  it("creates export statements", async () => {
    const repository = new Repository("/base/path");

    class AccountCoder extends Coder {
      *names() {
        yield "Account";
      }

      write() {
        return ts.factory.createObjectLiteralExpression([]);
      }
    }

    class AccountTypeCoder extends Coder {
      *names() {
        yield "AccountType";
      }

      write() {
        return typeLiteral([]);
      }
    }

    const script = repository.get("export-to-me.ts");

    script.export(new AccountCoder({}));
    script.exportType(new AccountTypeCoder({}));

    await script.finished();

    expect(script.exportStatements().map(printNode)).toStrictEqual([
      "export const Account = {};",
      "export type AccountType = {};",
    ]);
  });

  it("declares versioned code grouped by name and coder version", async () => {
    const repository = new Repository();

    class V1AccountTypeCoder extends Coder {
      public version = "1.0.0";

      *names() {
        yield "AccountV1";
      }

      write() {
        return typeLiteral([typeProperty("id", stringType())]);
      }
    }

    class V2AccountTypeCoder extends Coder {
      public version = "2.0.0";

      *names() {
        yield "AccountV2";
      }

      write() {
        return typeLiteral([
          typeProperty("id", stringType()),
          typeProperty("email", stringType()),
        ]);
      }
    }

    const script = repository.get("export-to-me.ts");

    script.declareVersion(new V1AccountTypeCoder({}), "Account");
    script.declareVersion(new V2AccountTypeCoder({}), "Account");

    await script.finished();

    expect(script.versionsTypeStatements().map(printNode)).toStrictEqual([
      'export type Versions = { Account: { "1.0.0": { id: string; }; "2.0.0": { id: string; email: string; }; }; };',
    ]);
  });

  it("outputs the contents (import and export statements)", async () => {
    const repository = new Repository("/base/path");

    const script = repository.get("script.ts");

    script.comments = ["This is a comment."];

    script.importStatements = () => [importDeclaration("foo", "./foo.js")];
    class BarCoder extends Coder {
      *names() {
        yield "bar";
      }
      write() {
        return valueExpression("Bar");
      }
    }
    class ClassCoder extends Coder {
      *names() {
        yield "DefaultClass";
      }
      write() {
        return ts.factory.createClassExpression(
          undefined,
          undefined,
          undefined,
          undefined,
          [],
        );
      }
    }
    script.export(new BarCoder({}));
    script.exportDefault(new ClassCoder({}));
    await expect(script.contents()).resolves.toBe(
      '// This is a comment.\nimport { foo } from "./foo.js";\nexport const bar = "Bar";\nexport default (class {});\n',
    );
  });

  it("outputs the contents including Versions when versions are declared", async () => {
    const repository = new Repository();
    const script = repository.get("script.ts");

    class UserCoder extends Coder {
      public version = "2025-01";

      write() {
        return typeLiteral([typeProperty("id", stringType())]);
      }
    }

    script.declareVersion(new UserCoder({}), "User");

    await expect(script.contents()).resolves.toContain(
      'export type Versions = { User: { "2025-01": { id: string } } };\n',
    );
  });
});
