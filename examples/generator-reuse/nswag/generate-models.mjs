import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const directory = fileURLToPath(new URL(".", import.meta.url));
process.chdir(directory);
const toolDirectory = path.join(directory, ".tools");
const executable = path.join(
  toolDirectory,
  process.platform === "win32" ? "nswag.exe" : "nswag",
);

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// A local, pinned .NET tool; no globally installed NSwag is assumed.
if (!existsSync(executable)) {
  run("dotnet", [
    "tool",
    "install",
    "NSwag.ConsoleCore",
    "--version",
    "14.6.3",
    "--tool-path",
    toolDirectory,
  ]);
}
mkdirSync("src/generated", { recursive: true });
run(executable, [
  "openapi2tsclient",
  "/input:openapi.json",
  "/output:src/generated/client.ts",
  "/Template:Fetch",
  "/GenerateClientClasses:true",
  "/GenerateDtoTypes:true",
  "/TypeStyle:Class",
  "/EnumStyle:Enum",
  "/TypeScriptVersion:5.0",
]);
