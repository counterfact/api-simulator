import { RESERVED_WORDS } from "./reserved-words.js";
import ts from "typescript";
import type { Requirement } from "./requirement.js";
import type { Script } from "./script.js";

/**
 * Base class for all code-generation helpers in the TypeScript generator.
 *
 * A `Coder` wraps a single {@link Requirement} node from the OpenAPI spec and
 * knows how to emit TypeScript code for it.  Subclasses override
 * {@link writeCode} to produce an AST node.
 *
 * Coders are used by {@link Script} and {@link Repository} to lazily generate
 * exports and imports, resolving `$ref` references through the
 * {@link Specification} before writing.
 */
export class Coder {
  public requirement: Requirement;
  public version: string;

  public constructor(requirement: Requirement, version = "") {
    this.requirement = requirement;
    this.version = version;
  }

  /**
   * A stable cache key for this coder, composed of the constructor name and
   * either the `$ref` value (for references) or the requirement URL.
   */
  public get id(): string {
    if (this.requirement.isReference) {
      return `${this.constructor.name}@${this.requirement.refUrl as string}`;
    }

    return `${this.constructor.name}@${this.requirement.url}`;
  }

  /** Identity of a logical export, which may be shared by versioned inputs. */
  public get exportId(): string {
    return this.id;
  }

  /** Override when one export requires several declarations or deferred assembly. */
  public exportDeclarations(
    _script: Script,
    _name: string,
  ): ts.Statement[] | undefined {
    return undefined;
  }

  /**
   * Returns a JSDoc comment block to be placed immediately before the export.
   *
   * Returns `""` by default; subclasses override this to surface OpenAPI
   * metadata (description, summary, examples, etc.).
   */
  public jsdoc(): string {
    return "";
  }

  /**
   * Writes this coder's contribution to `script`.
   *
   * When the requirement is a `$ref`, delegates to {@link Script.import} so
   * the reference target is exported from its own module.  Otherwise calls
   * {@link writeCode}.
   *
   * @param script - The script being assembled.
   * @returns The type or expression node for this coder's export value.
   */
  public write(script: Script): ts.Expression | ts.TypeNode {
    if (this.requirement.isReference) {
      return ts.factory.createIdentifier(script.import(this));
    }

    return this.writeCode(script);
  }

  /**
   * Generates the AST node for this coder's value.
   *
   * This method is abstract — subclasses **must** override it.
   *
   * @param _script - The script being assembled.
   * @throws Always — callers should never reach the base implementation.
   */
  public writeCode(_script: Script): ts.Expression | ts.TypeNode {
    throw new Error(
      "write() is abstract and should be overwritten by a subclass",
    );
  }

  /**
   * Resolves `$ref` references by returning the target coder.
   *
   * When this coder's requirement is not a reference, returns `this`.
   * Otherwise loads the referenced requirement and wraps it in an instance of
   * the same concrete coder class.
   */
  public async delegate(): Promise<Coder> {
    if (!this.requirement.isReference) {
      return this;
    }

    const requirement = await this.requirement.reference();

    return new (
      this.constructor as new (req: Requirement, version: string) => Coder
    )(requirement, this.version);
  }

  /**
   * Generator that yields candidate export names for this coder.
   *
   * The first name is derived from the last path segment of the requirement
   * URL, sanitised to be a valid TypeScript identifier.  Subsequent names have
   * an incrementing numeric suffix to resolve collisions.
   *
   * @param rawName - Override the starting name (used by subclasses).
   */
  public *names(
    rawName = this.requirement.url.split("/").at(-1)!,
  ): Generator<string> {
    const name = rawName
      .replace(/^\d/u, (digit) => `_${digit}`)
      .replaceAll(/[^\w$]/gu, "_");

    const baseName = RESERVED_WORDS.has(name) ? `${name}_` : name;

    yield baseName;

    let index = 1;

    const MAX_NAMES_TO_GENERATE_BEFORE_GIVING_UP = 100;

    while (index < MAX_NAMES_TO_GENERATE_BEFORE_GIVING_UP) {
      index += 1;
      yield baseName + index;
    }
  }

  /**
   * Returns an optional TypeScript type annotation node to be placed between
   * the export name and its value (`export const name: <type> = value`).
   *
   * Returns `undefined` by default.
   */
  public typeDeclaration(
    _namespace?: Map<string, ExportStatement>,
    _script?: Script,
  ): ts.TypeNode | undefined {
    return undefined;
  }

  /**
   * Returns the repository-relative path of the script where this coder's
   * export should live when imported by another script.
   *
   * Subclasses override this to place type exports in `types/paths/…` and
   * route exports in `routes/…`.
   */
  public modulePath(): string {
    return "did-not-override-coder-modulePath.ts";
  }
}

export interface ExportStatement {
  done: boolean;
  id: string;
  isDefault: boolean;
  isType: boolean;
  jsdoc: string;
  typeDeclaration?: ts.TypeNode;
  name?: string;
  node?: ts.Expression | ts.TypeNode;
  statements?: ts.Statement[];
  error?: Error;
  promise?: Promise<Coder | undefined>;
}
