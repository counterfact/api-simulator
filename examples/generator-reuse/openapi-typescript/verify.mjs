import assert from "node:assert/strict";
import ts from "typescript";

// Verify actual generator artifacts as well as compiler compatibility. Identical
// structural types alone would not prove that Counterfact reused an import.
const upstream = ts.sys.readFile("src/generated/schema.ts");
assert.ok(upstream, "Run the real openapi-typescript generator first");
assert.match(upstream, /export interface components/);
const file = ts.sys.readFile("api/types/components/schemas/Pet.ts");
assert.ok(file, "Run Counterfact generation first");
assert.match(file, /import type[\s\S]*from ["']@app\/api-models["']/);
assert.match(file, /\["schemas"\]\["Pet"\]/);
console.log(
  "Verified real upstream components export and Counterfact's imported Pet alias.",
);
