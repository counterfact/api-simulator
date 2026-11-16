import path from "node:path";
import { fileURLToPath } from "node:url";

import { createCounterfactTest, expect } from "@counterfact/playwright";

export const test = createCounterfactTest({
  basePath: path.join(path.dirname(fileURLToPath(import.meta.url)), "api"),
});
export { expect };
