import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const version = "7.27.0";
const cwd = fileURLToPath(new URL(".", import.meta.url));
const tools = new URL(".tools/", import.meta.url);
mkdirSync(tools, { recursive: true });
const jar = fileURLToPath(
  new URL(`openapi-generator-cli-${version}.jar`, tools),
);
function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd, stdio: "inherit", ...options });
}
if (!existsSync(jar)) {
  run("curl", [
    "--fail",
    "--location",
    "--retry",
    "3",
    "--output",
    jar,
    `https://repo.maven.apache.org/maven2/org/openapitools/openapi-generator-cli/${version}/openapi-generator-cli-${version}.jar`,
  ]);
}
const actual = run("java", ["-jar", jar, "version"], {
  encoding: "utf8",
  stdio: "pipe",
}).trim();
if (actual !== version)
  throw new Error(`Expected OpenAPI Generator ${version}; got ${actual}`);
run("java", [
  "-jar",
  jar,
  "generate",
  "-g",
  "typescript-axios",
  "-i",
  "openapi.json",
  "-o",
  "src/generated/sdk",
  "--additional-properties",
  "modelPropertyNaming=original,stringEnums=false,hideGenerationTimestamp=true,withSeparateModelsAndApi=true,modelPackage=models,apiPackage=apis",
]);
