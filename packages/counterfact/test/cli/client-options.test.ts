import { describe, expect, it } from "@jest/globals";

import {
  resolveClientOptions,
  resolveTypeOptions,
} from "../../src/cli/client-options.js";

describe("resolveClientOptions", () => {
  it("uses the generator defaults when no client options are given", () => {
    expect(resolveClientOptions({})).toEqual({});
  });

  it("converts CLI and counterfact.yaml values", () => {
    expect(
      resolveClientOptions({
        apiClassName: "TreasuryApi",
        moduleClassSuffix: "Client",
        moduleNameFirstTag: true,
        moduleNameIndex: "1",
        typePrefix: "I",
        typeSuffix: "Dto",
        unwrapResponseData: true,
      }),
    ).toEqual({
      apiClassName: "TreasuryApi",
      moduleClassSuffix: "Client",
      moduleNameFirstTag: true,
      moduleNameIndex: 1,
      typePrefix: "I",
      typeSuffix: "Dto",
      unwrapResponseData: true,
    });
  });

  it("ignores switches that are turned off", () => {
    expect(
      resolveClientOptions({
        moduleNameFirstTag: false,
        unwrapResponseData: false,
      }),
    ).toEqual({});
  });

  it.each([-1, 1.5, "first"])(
    "rejects the module name index %p",
    (moduleNameIndex) => {
      expect(() => resolveClientOptions({ moduleNameIndex })).toThrow(
        /--module-name-index must be a non-negative integer/u,
      );
    },
  );

  it.each(["my-api", "1Api", ""])(
    "rejects the API class name %p",
    (apiClassName) => {
      expect(() => resolveClientOptions({ apiClassName })).toThrow(
        /--api-class-name must be a valid TypeScript identifier/u,
      );
    },
  );

  it.each([
    ["moduleClassSuffix", "--module-class-suffix"],
    ["typePrefix", "--type-prefix"],
    ["typeSuffix", "--type-suffix"],
  ])("rejects a %s that is not made of identifier characters", (key, flag) => {
    expect(() => resolveClientOptions({ [key]: "-Dto" })).toThrow(
      `${flag} must contain only letters, digits, _ and $`,
    );
  });
});

describe("resolveTypeOptions", () => {
  it("keeps the standard declarations when no type options are given", () => {
    expect(resolveTypeOptions({})).toEqual({});
  });

  it("converts CLI and counterfact.yaml values", () => {
    expect(
      resolveTypeOptions({
        enumStyle: "enum",
        ignoreNullable: true,
        preferInterfaces: true,
        validationJsdoc: true,
      }),
    ).toEqual({
      enumStyle: "enum",
      ignoreNullable: true,
      preferInterfaces: true,
      validationJsDoc: true,
    });
  });

  it("ignores switches that are turned off", () => {
    expect(
      resolveTypeOptions({
        ignoreNullable: false,
        preferInterfaces: false,
        validationJsdoc: false,
      }),
    ).toEqual({});
  });

  it("rejects an unknown enum style", () => {
    expect(() => resolveTypeOptions({ enumStyle: "string" })).toThrow(
      /--enum-style must be one of union, enum, const/u,
    );
  });
});
