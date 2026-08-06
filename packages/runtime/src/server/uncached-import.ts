import { pathToFileURL } from "node:url";

let cacheBustSequence = 0;

export async function uncachedImport(pathName: string) {
  const fileUrl = `${pathToFileURL(
    pathName,
  ).toString()}?cacheBust=${Date.now()}-${cacheBustSequence++}`;

  return await import(fileUrl);
}
