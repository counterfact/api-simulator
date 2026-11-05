import { expect, it } from "@jest/globals";

import { sanitizeIdentifier } from "../src/sanitize-identifier.js";

it.each([
  ["getUser", "getUser"],
  ["get-user-profile", "getUserProfile"],
  ["user.get", "userGet"],
  ["get user", "getUser"],
  ["get@user!", "getUser"],
  ["123getUser", "_123getUser"],
  ["delete", "delete_"],
  ["import", "import_"],
  ["await", "await_"],
  ["delete!!", "delete_"],
  ["deleteItem", "deleteItem"],
  ["!!!", "_"],
])(
  "sanitizes legacy operation names and version labels: %s",
  (input, expected) => {
    expect(sanitizeIdentifier(input)).toBe(expected);
  },
);
