import type { usingTemporaryFiles } from "using-temporary-files";
import { generateVersionsTsContent } from "../../src/versions-ts-generator.js";

type TemporaryFiles = Parameters<Parameters<typeof usingTemporaryFiles>[0]>[0];

export async function addVersionFile(
  $: TemporaryFiles,
  version: string,
  directory: string,
) {
  if (version === "") return;
  await $.add(
    `${directory}/versions.ts`,
    await generateVersionsTsContent([version]),
  );
}
