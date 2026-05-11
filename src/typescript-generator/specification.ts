import { bundle } from "@apidevtools/json-schema-ref-parser";
import createDebug from "debug";

import { applyOverlays } from "../util/apply-overlay.js";
import { Requirement, type RequirementData } from "./requirement.js";

const debug = createDebug("counterfact:typescript-generator:specification");

/**
 * Represents a fully dereferenced OpenAPI specification as a navigable tree
 * of {@link Requirement} nodes.
 *
 * Use {@link Specification.fromFile} to load a spec from disk or a URL; the
 * static method bundles external `$ref` references into a single in-memory
 * object before constructing the tree.
 */
export class Specification {
  public cache: Map<string, Requirement>;
  public rootRequirement!: Requirement;

  public constructor(rootRequirement?: Requirement) {
    this.cache = new Map();
    if (rootRequirement) {
      this.rootRequirement = rootRequirement;
    }
  }

  /**
   * Loads the OpenAPI document at `urlOrPath`, bundles all external `$ref`
   * references, and returns a fully initialised {@link Specification}.
   *
   * @param urlOrPath   - A local file path or HTTP(S) URL.
   * @param overlays    - Optional ordered list of overlay file paths/URLs to
   *   apply after loading the document.
   * @throws When the document cannot be found or parsed.
   */
  public static async fromFile(
    urlOrPath: string,
    overlays: readonly string[] = [],
  ): Promise<Specification> {
    const specification = new Specification();
    await specification.load(urlOrPath, overlays);
    return specification;
  }

  /**
   * Returns the {@link Requirement} at `url` (a JSON Pointer such as
   * `"#/paths"`).
   *
   * @param url - A JSON Pointer string (must start with `"#/"`).
   */
  public getRequirement(url: string): Requirement {
    debug("getting requirement at %s", url);

    return this.rootRequirement.select(url.slice(2))!;
  }

  /**
   * Loads (or reloads) the specification from `urlOrPath`, then applies any
   * overlay files listed in `overlays` in order.
   *
   * @param urlOrPath - A local file path or HTTP(S) URL.
   * @param overlays  - Optional ordered list of overlay file paths/URLs.
   * @throws When the document cannot be found or parsed.
   */
  public async load(
    urlOrPath: string,
    overlays: readonly string[] = [],
  ): Promise<void> {
    try {
      const document = (await bundle(urlOrPath, {
        resolve: { http: { safeUrlResolver: false } },
      })) as RequirementData;

      if (overlays.length > 0) {
        await applyOverlays(
          document as unknown as Record<string, unknown>,
          overlays,
        );
      }

      this.rootRequirement = new Requirement(document, urlOrPath, this);
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Could not load the OpenAPI spec from "${urlOrPath}".\n${details}`,
        { cause: error },
      );
    }
  }
}
