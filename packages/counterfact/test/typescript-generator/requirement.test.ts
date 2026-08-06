import { describe, expect, it } from "@jest/globals";

import { Requirement } from "../../src/typescript-generator/requirement.js";
import { Specification } from "../../src/typescript-generator/specification.js";

describe("a Requirement", () => {
  const root = new Requirement({
    source: {
      $ref: "#/target",
    },
    target: {
      name: "target",
      found: "yep",
    },
    a: {
      name: "a",
      b: {
        name: "b",
        c: {
          name: "c",
        },
        target: {
          $ref: "#/target",
        },
      },
    },
  });

  const spec = new Specification(root);

  root.specification = spec;

  it("select(name) - returns a new requirement", () => {
    const specification = {};
    const requirement = new Requirement(
      { address: { type: "Address" }, phone: { type: "string" } },
      "openapi.yaml#/components/schemas/Person",
      specification,
    );

    const phone = requirement.select("phone");

    expect(phone.specification).toBe(specification);
    expect(phone.url).toBe("openapi.yaml#/components/schemas/Person/phone");
    expect(phone.data).toStrictEqual({ type: "string" });
  });

  it("select(path) - decodes percent-encoded path segments", () => {
    const requirement = new Requirement({
      " my key": { found: true },
    });

    expect(requirement.select("%20my%20key")?.data).toStrictEqual({
      found: true,
    });
  });

  it("select(path) - returns path segment unchanged when decodeURIComponent throws", () => {
    const requirement = new Requirement({
      "%invalid": { found: true },
    });

    expect(requirement.select("%invalid")?.data).toStrictEqual({ found: true });
  });

  it("select(name) - escape special characters", () => {
    const requirement = new Requirement({
      "foo/bar": "slash",
      "foo~bar": "tilde",
    });

    expect(requirement.select("foo~0bar").data).toBe("tilde");
    expect(requirement.select("foo~1bar").data).toBe("slash");
  });

  it("select(path)", () => {
    expect(root.select("a/b/c").data).toStrictEqual({ name: "c" });
  });

  it("select(path) with $ref", () => {
    expect(root.select("a/b/target/name").data).toStrictEqual("target");
  });

  it("get(name) - does not escape special characters", () => {
    const requirement = new Requirement({
      "foo/bar": "slash",
      "foo~bar": "tilde",
    });

    expect(requirement.get("foo~bar").data).toBe("tilde");
    expect(requirement.get("foo/bar").data).toBe("slash");
  });

  it("get(name) - sets parent on the returned requirement", () => {
    const parent = new Requirement({ child: { value: 42 } });
    const child = parent.get("child");

    expect(child?.parent).toBe(parent);
  });

  it("get(name) - root requirement has no parent", () => {
    const requirement = new Requirement({ value: 1 });

    expect(requirement.parent).toBeUndefined();
  });

  it("select(path) - sets parent chain correctly through multi-step navigation", () => {
    const requirement = new Requirement({
      a: { b: { c: { value: "leaf" } } },
    });
    const leaf = requirement.select("a/b/c")!;

    // c's parent is b, b's parent is a, a's parent is the root requirement
    expect(leaf.parent?.data).toStrictEqual({ c: { value: "leaf" } });
    expect(leaf.parent?.parent?.data).toStrictEqual({
      b: { c: { value: "leaf" } },
    });
    expect(leaf.parent?.parent?.parent).toBe(requirement);
  });

  it("get(name) - follow $ref", () => {
    const requirement = root.get("source");
    expect(requirement.get("found").data).toEqual("yep");
  });

  it("knows if it is a reference ($ref)", () => {
    const yes = new Requirement({
      $ref: "some.yaml#other/url",
    });

    const no = new Requirement({
      type: "string",
    });

    expect([yes.isReference, no.isReference]).toStrictEqual([true, false]);
  });

  it("knows it has a property", () => {
    const requirement = new Requirement({
      found: "yep",
    });

    expect([
      requirement.has("found"),
      requirement.has("notFound"),
    ]).toStrictEqual([true, false]);
  });

  it("knows it has a when the requirement is a $ref", () => {
    const requirement = root.get("source");

    expect([
      requirement.has("found"),
      requirement.has("notFound"),
    ]).toStrictEqual([true, false]);
  });

  it("provides a forEach() method", () => {
    const requirement = new Requirement({
      address: { type: "Address" },
      "foo/bar~baz": { type: "SpecialChars" },
      phone: { type: "string" },
    });

    const phone = requirement.select("phone");
    const address = requirement.select("address");
    const specialChars = requirement.select("foo~1bar~0baz");

    const result = [];

    requirement.forEach((value, key) => {
      result.push([key, value]);
    });

    expect(result).toStrictEqual([
      ["address", address],
      ["foo/bar~baz", specialChars],
      ["phone", phone],
    ]);
  });

  it("provides a map() method", () => {
    const requirement = new Requirement({
      address: { type: "Address" },
      "foo/bar~baz": { type: "SpecialChars" },
      phone: { type: "string" },
    });

    const phone = requirement.select("phone");
    const address = requirement.select("address");
    const specialChars = requirement.select("foo~1bar~0baz");

    const result = requirement.map((subRequirement, key) => [
      `${key}!`,
      subRequirement,
    ]);

    expect(result).toStrictEqual([
      ["address!", address],
      ["foo/bar~baz!", specialChars],
      ["phone!", phone],
    ]);
  });

  it("provides a flatMap() method", () => {
    const requirement = new Requirement({
      a: "foo",

      b: "bar",
    });

    const result = requirement.flatMap((subRequirement, key) => [
      `${key}: ${subRequirement.data} 1`,

      `${key}: ${subRequirement.data} 2`,
    ]);

    expect(result).toStrictEqual([
      "a: foo 1",
      "a: foo 2",
      "b: bar 1",
      "b: bar 2",
    ]);
  });

  it("provides a find(fn) method", () => {
    const requirement = new Requirement({
      a: "foo",
      b: "bar",
    });

    const result = requirement.find(
      // eslint-disable-next-line jest/no-conditional-in-test
      (subRequirement, key) => key === "b" && subRequirement.data === "bar",
    );

    expect(result).toStrictEqual(requirement.get("b"));
  });
});
