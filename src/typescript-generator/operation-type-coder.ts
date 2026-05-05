import { pathJoin } from "../util/forward-slash-path.js";
import { CONTEXT_FILE_TOKEN } from "./context-file-token.js";
import { buildJsDoc } from "./jsdoc.js";
import { ParameterExportTypeCoder } from "./parameter-export-type-coder.js";
import { ParametersTypeCoder } from "./parameters-type-coder.js";
import { READ_ONLY_COMMENTS } from "./read-only-comments.js";
import { RESERVED_WORDS } from "./reserved-words.js";
import { ResponsesTypeCoder } from "./responses-type-coder.js";
import { SchemaTypeCoder } from "./schema-type-coder.js";
import { TypeCoder } from "./type-coder.js";
import { Requirement } from "./requirement.js";
import type { RequirementData } from "./requirement.js";
import type { Script } from "./script.js";

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#reserved_words

function sanitizeIdentifier(value: string): string {
  // Treat any run of non-identifier characters as a camelCase separator
  let result = value.replaceAll(/[^\w$]+(?<next>.)/gu, (_, char: string) =>
    char.toUpperCase(),
  );

  // Strip any trailing non-identifier characters (no following char to capitalize)
  result = result.replaceAll(/[^\w$]/gu, "");

  // If the identifier starts with a digit, prefix with an underscore
  if (/^\d/u.test(result)) {
    result = `_${result}`;
  }

  // If the identifier is a reserved word, append an underscore
  if (RESERVED_WORDS.has(result)) {
    result = `${result}_`;
  }

  return result || "_";
}

export interface SecurityScheme {
  scheme?: string;
  type?: string;
}

/**
 * Generates the TypeScript type for a single OpenAPI operation.
 *
 * The emitted type describes the function signature that a Counterfact route
 * handler must satisfy, including strongly-typed `query`, `path`, `headers`,
 * `cookie`, `body`, `context`, `response`, and `user` arguments.
 *
 * Output is written to `types/paths/<route>.types.ts`.
 *
 * **Versioned APIs**: when `version` is non-empty this coder emits only a
 * sentinel `{raw: ""}` export (suppressing the normal flat type) and
 * registers a formatter on the shared script so that
 * {@link Script.versionsTypeStatements} can later emit the merged
 * `HTTP_<METHOD>_$_Versions` map and the `HTTP_<METHOD>` handler type.
 * Each version's `$`-argument type is emitted to
 * `types/<version>/paths/<path>.types.ts` by {@link VersionedArgTypeCoder}.
 */
export class OperationTypeCoder extends TypeCoder {
  public requestMethod: string;
  public securitySchemes: SecurityScheme[];

  public constructor(
    requirement: Requirement,
    version = "",
    requestMethod = "",
    securitySchemes: SecurityScheme[] = [],
  ) {
    super(requirement, version);

    if (requestMethod === "") {
      throw new Error("requestMethod is required");
    }

    this.requestMethod = requestMethod;
    this.securitySchemes = securitySchemes;
  }

  /**
   * Returns the base identifier for this operation, derived from its
   * `operationId` (sanitised) or falling back to `HTTP_<METHOD>`.
   */
  public getOperationBaseName(): string {
    const operationId = this.requirement.get("operationId")?.data as
      | string
      | undefined;

    return operationId
      ? sanitizeIdentifier(operationId)
      : `HTTP_${this.requestMethod.toUpperCase()}`;
  }

  public override jsdoc(): string {
    return buildJsDoc(this.requirement.data);
  }

  public override names(): Generator<string> {
    return super.names(this.getOperationBaseName());
  }

  /**
   * Generates and exports a named parameter type (e.g. `ListPets_Query`) from
   * `modulePath` and returns the exported type name.
   *
   * Returns `"never"` without creating an export when `inlineType` is
   * `"never"`.
   *
   * @param script - The script being assembled.
   * @param parameterKind - `"query"`, `"path"`, `"headers"`, or `"cookie"`.
   * @param inlineType - The inline TypeScript type string to export.
   * @param baseName - The base identifier prefix for the exported type name.
   * @param modulePath - The repository-relative path of the type file.
   */
  public exportParameterType(
    script: Script,
    parameterKind: string,
    inlineType: string,
    baseName: string,
    modulePath: string,
  ): string {
    if (inlineType === "never") {
      return "never";
    }

    const capitalize = (str: string): string =>
      str.charAt(0).toUpperCase() + str.slice(1);
    const typeName = `${baseName}_${capitalize(parameterKind)}`;

    const coder = new ParameterExportTypeCoder(
      this.requirement,
      this.version,
      typeName,
      inlineType,
      parameterKind,
    );
    coder._modulePath = modulePath;

    return script.export(coder, true);
  }

  /**
   * Returns the union of all possible response type shapes for this operation.
   *
   * @param script - The script being assembled (used to resolve imports).
   */
  public responseTypes(script: Script): string {
    return this.requirement
      .get("responses")!
      .flatMap((response, responseCode): string | string[] => {
        const status =
          responseCode === "default"
            ? "number | undefined"
            : Number.parseInt(responseCode, 10);

        if (response.has("content")) {
          return response.get("content")!.map(
            (content, contentType) => `{  
              status: ${status}, 
              contentType?: "${contentType}",
              body?: ${content.has("schema") ? new SchemaTypeCoder(content.get("schema")!, this.version).write(script) : "unknown"}
            }`,
          );
        }

        if (response.has("schema")) {
          const producesReq =
            this.requirement?.get("produces") ??
            this.requirement.specification?.rootRequirement?.get("produces");
          const produces = producesReq?.data as string[] | undefined;

          if (produces) {
            return produces
              .map(
                (contentType) => `{
            status: ${status},
            contentType?: "${contentType}",
            body?: ${new SchemaTypeCoder(response.get("schema")!, this.version).write(script)}
          }`,
              )
              .join(" | ");
          }
        }

        return `{  
          status: ${status} 
        }`;
      })

      .join(" | ");
  }

  public override modulePath(): string {
    const pathString = this.requirement.url
      .split("/")
      .at(-2)!
      .replaceAll("~1", "/");

    return `${pathJoin(
      "types/paths",
      pathString === "/" ? "/index" : pathString,
    )}.types.ts`;
  }

  /**
   * Returns the TypeScript type for the `user` argument.
   *
   * When the operation is protected by HTTP Basic auth, the type is
   * `{username?: string, password?: string}`.  Otherwise it is `"never"`.
   */
  public userType(): string {
    if (
      this.securitySchemes.some(
        ({ scheme, type }) => type === "http" && scheme === "basic",
      )
    ) {
      return "{username?: string, password?: string}";
    }

    return "never";
  }

  /**
   * Returns the effective parameters for this operation by merging path-item-level
   * parameters with operation-level parameters. Per the OpenAPI specification,
   * operation-level parameters override path-item-level parameters that share
   * the same `name` and `in` location.
   *
   * Uses `this.requirement.parent` (the path item requirement) to access
   * path-item-level parameters directly, without URL string parsing.
   *
   * When the parent is not set (e.g. in unit tests that construct requirements
   * directly), only the operation-level parameters are returned.
   */
  protected getEffectiveParameters(): Requirement | undefined {
    const operationParams = this.requirement.get("parameters");
    const pathItemParams = this.requirement.parent?.get("parameters");

    if (!pathItemParams) {
      return operationParams;
    }

    if (!operationParams) {
      return pathItemParams;
    }

    // Merge using a Map keyed on `${in}:${name}`.
    // Path-level params are added first; operation-level overrides them.
    const pathData = pathItemParams.data as unknown as Record<
      string,
      unknown
    >[];
    const opData = operationParams.data as unknown as Record<string, unknown>[];

    const map = new Map<string, Record<string, unknown>>();

    for (const p of pathData) {
      map.set(`${p.in as string}:${p.name as string}`, p);
    }

    for (const p of opData) {
      map.set(`${p.in as string}:${p.name as string}`, p);
    }

    return new Requirement(
      [...map.values()] as unknown as RequirementData,
      this.requirement.url,
      this.requirement.specification,
    );
  }

  /**
   * Builds the `OmitValueWhenNever<{…}>` dollar-argument type body and sets
   * up all required shared-type imports on `script`.
   *
   * This helper is reused by both {@link writeCode} (non-versioned) and
   * {@link VersionedArgTypeCoder.writeCode} (per-version file).
   *
   * @param script - The script to write imports and parameter-type exports into.
   * @param baseName - Identifier prefix used for named parameter-type exports.
   * @param modulePath - Repository-relative path for parameter-type exports.
   */
  protected buildDollarArgType(
    script: Script,
    baseName: string,
    modulePath: string,
  ): string {
    const xType = script.importSharedType("WideOperationArgument");

    script.importSharedType("OmitValueWhenNever");
    script.importSharedType("COUNTERFACT_RESPONSE");

    const contextTypeImportName = script.importExternalType(
      "Context",
      CONTEXT_FILE_TOKEN,
    );

    const parameters = this.getEffectiveParameters();

    const queryType = new ParametersTypeCoder(
      parameters!,
      this.version,
      "query",
    ).write(script);

    const pathType = new ParametersTypeCoder(
      parameters!,
      this.version,
      "path",
    ).write(script);

    const headersType = new ParametersTypeCoder(
      parameters!,
      this.version,
      "header",
    ).write(script);

    const cookieType = new ParametersTypeCoder(
      parameters!,
      this.version,
      "cookie",
    ).write(script);

    const bodyRequirement =
      (this.requirement.get("consumes") ??
      this.requirement.specification?.rootRequirement?.get("consumes"))
        ? parameters
            ?.find((parameter) =>
              ["body", "formData"].includes(
                parameter.get("in")?.data as unknown as string,
              ),
            )
            ?.get("schema")
        : this.requirement.select(
            "requestBody/content/application~1json/schema",
          );

    const bodyType =
      bodyRequirement === undefined
        ? "never"
        : new SchemaTypeCoder(bodyRequirement, this.version).write(script);

    const openApi2MediaTypes = (this.requirement.get("produces")?.data ??
      this.requirement.specification?.rootRequirement?.get("produces")
        ?.data) as string[] | undefined;

    const responseType = new ResponsesTypeCoder(
      this.requirement.get("responses")!,
      this.version,
      openApi2MediaTypes,
    ).write(script);

    const proxyType = "(url: string) => COUNTERFACT_RESPONSE";

    const delayType =
      "(milliseconds: number, maxMilliseconds?: number) => Promise<void>";

    const queryTypeName = this.exportParameterType(
      script,
      "query",
      queryType,
      baseName,
      modulePath,
    );
    const pathTypeName = this.exportParameterType(
      script,
      "path",
      pathType,
      baseName,
      modulePath,
    );
    const headersTypeName = this.exportParameterType(
      script,
      "headers",
      headersType,
      baseName,
      modulePath,
    );

    const cookieTypeName = this.exportParameterType(
      script,
      "cookie",
      cookieType,
      baseName,
      modulePath,
    );

    // OpenAPI 3.2 querystring parameter: the entire query string treated as a
    // single typed object (similar to requestBody for query strings).
    const querystringParam = parameters?.find(
      (parameter) => (parameter.get("in")?.data as string) === "querystring",
    );
    const querystringType =
      querystringParam?.has("schema") === true
        ? new SchemaTypeCoder(
            querystringParam.get("schema")!,
            this.version,
          ).write(script)
        : "never";
    const querystringTypeName = this.exportParameterType(
      script,
      "querystring",
      querystringType,
      baseName,
      modulePath,
    );

    const versionLiteralType =
      this.version !== "" ? `"${this.version}"` : "never";

    return `OmitValueWhenNever<{ query: ${queryTypeName}, querystring: ${querystringTypeName}, path: ${pathTypeName}, headers: ${headersTypeName}, cookie: ${cookieTypeName}, body: ${bodyType}, context: ${contextTypeImportName}, response: ${responseType}, x: ${xType}, proxy: ${proxyType}, user: ${this.userType()}, delay: ${delayType}, version: ${versionLiteralType} }>`;
  }

  public override writeCode(script: Script): string {
    script.comments = READ_ONLY_COMMENTS;

    if (this.version !== "") {
      // Versioned case: suppress the normal flat export and register a
      // formatter so that Script.versionsTypeStatements() can emit the
      // merged HTTP_<METHOD>_$_Versions + HTTP_<METHOD> types after all
      // versions have been declared via declareVersion().
      const versionedType = script.importVersionsType("Versioned");
      const maybePromiseType = script.importSharedType("MaybePromise");
      const counterfactResponseType = script.importSharedType(
        "COUNTERFACT_RESPONSE",
      );
      const baseName = this.getOperationBaseName();

      script.setVersionFormatter(baseName, (versionCodes) => {
        const versionsTypeName = `${baseName}_$_Versions`;
        const versionMap = Array.from(
          versionCodes,
          ([v, code]) => `"${v}": ${code}`,
        ).join("; ");

        return [
          `type ${versionsTypeName} = { ${versionMap} };`,
          `export type ${baseName} = ($: ${versionedType}<${versionsTypeName}>) => ${maybePromiseType}<${counterfactResponseType}>;`,
        ].join("\n");
      });

      // Return a raw-empty sentinel so exportStatements() emits nothing for
      // this export entry.  The real export is produced by
      // versionsTypeStatements().
      return { raw: "" } as unknown as string;
    }

    // Non-versioned case: existing flat-type output.
    // Import in the same order as the original writeCode so that the emitted
    // import block is identical to the pre-refactor output (snapshot-safe).
    script.importSharedType("WideOperationArgument");
    script.importSharedType("OmitValueWhenNever");
    script.importSharedType("MaybePromise");
    script.importSharedType("COUNTERFACT_RESPONSE");

    const baseName = this.getOperationBaseName();
    const modulePath = this.modulePath();
    const dollarArgType = this.buildDollarArgType(script, baseName, modulePath);

    return `($: ${dollarArgType}) => MaybePromise<COUNTERFACT_RESPONSE>`;
  }
}

/**
 * Emits a per-version `$`-argument type to
 * `types/<version>/paths/<path>.types.ts`.
 *
 * When called from a *different* script (e.g. the shared
 * `types/paths/…` script via `Script.declareVersion`), `write()` delegates to
 * `script.importType(this)` so that the type is written to the per-version
 * file and an import is added to the calling script.
 *
 * Only the `OmitValueWhenNever<{…}>` type body is emitted — the
 * function-wrapper `($: Versioned<…>) => MaybePromise<COUNTERFACT_RESPONSE>`
 * is assembled by the shared script's `versionsTypeStatements()`.
 */
export class VersionedArgTypeCoder extends OperationTypeCoder {
  /**
   * Include the version in the cache key so v1 and v2 coders are treated as
   * distinct exports even when they share the same requirement URL.
   */
  public override get id(): string {
    return `${super.id}:${this.version}`;
  }

  /**
   * The per-version `$`-argument type is emitted to
   * `types/<version>/paths/<path>.types.ts`, not to the shared path.
   */
  public override modulePath(): string {
    const pathString = this.requirement.url
      .split("/")
      .at(-2)!
      .replaceAll("~1", "/");

    return `${pathJoin(
      `types/${this.version}/paths`,
      pathString === "/" ? "/index" : pathString,
    )}.types.ts`;
  }

  /**
   * Names are version-qualified (e.g. `HTTP_GET_$_v1`) so that importing
   * multiple versions into the shared script requires no aliasing.
   */
  public override *names(): Generator<string> {
    const baseName = `${this.getOperationBaseName()}_$_${sanitizeIdentifier(this.version)}`;

    yield baseName;

    let index = 1;
    const MAX = 100;

    while (index < MAX) {
      index += 1;
      yield `${baseName}${index}`;
    }
  }

  /**
   * When called from the per-version file itself, generate the actual type.
   * When called from any other script (e.g. the shared file), export to the
   * per-version file and import the result back into that script.
   */
  public override write(script: Script): string {
    if (script.path === this.modulePath()) {
      return this.writeCode(script);
    }

    return script.importType(this);
  }

  /**
   * Generates the `OmitValueWhenNever<{…}>` dollar-argument type and writes
   * it to the per-version script.
   */
  public override writeCode(script: Script): string {
    script.comments = READ_ONLY_COMMENTS;
    const baseName = this.getOperationBaseName();

    return this.buildDollarArgType(script, baseName, this.modulePath());
  }
}
