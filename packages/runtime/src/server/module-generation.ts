import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const GENERATION = "counterfactGeneration";
let hooksRegistered = false;

function registerGenerationHook(): void {
  if (hooksRegistered) return;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context);
      if (!context.parentURL?.startsWith("file:")) return resolved;
      const generation = new URL(context.parentURL).searchParams.get(
        GENERATION,
      );
      if (
        generation === null ||
        !resolved.url.startsWith("file:") ||
        resolved.format === "commonjs" ||
        !(
          specifier.startsWith(".") ||
          specifier.startsWith("/") ||
          specifier.startsWith("file:") ||
          specifier.startsWith("#")
        )
      )
        return resolved;
      const url = new URL(resolved.url);
      if (url.pathname.includes("/node_modules/")) return resolved;
      url.searchParams.set(GENERATION, generation);
      return { ...resolved, url: url.href };
    },
  });
  hooksRegistered = true;
}

/** A coherent ESM graph; native Node caching is confined to this generation. */
export class ModuleGeneration {
  private readonly id = randomUUID();

  public async import(pathName: string): Promise<unknown> {
    // Only ESM loading needs the hook. Keep it installed for delayed dynamic
    // imports without retaining individual loaders or generation registries.
    registerGenerationHook();
    const url = pathToFileURL(pathName);
    url.searchParams.set(GENERATION, this.id);
    return import(url.href);
  }
}
