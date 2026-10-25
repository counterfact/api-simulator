import { STREAMING_CONTENT_TYPES } from "@counterfact/types/streaming-content-types";

import { sanitizeIdentifier } from "./sanitize-identifier.js";
import { pathJoin } from "./forward-slash-path.js";
import ts from "typescript";
import {
  functionType,
  literalType,
  neverType,
  numberType,
  parameter,
  stringType,
  typeAlias,
  typeLiteral,
  typeProperty,
  typeReference,
  unionType,
  unknownType,
} from "./ast.js";
import { buildJsDoc } from "./jsdoc.js";
import { ParameterExportTypeCoder } from "./parameter-export-type-coder.js";
import { ParametersTypeCoder } from "./parameters-type-coder.js";
import { READ_ONLY_COMMENTS } from "./read-only-comments.js";
import { ResponsesTypeCoder } from "./responses-type-coder.js";
import { SchemaTypeCoder } from "./schema-type-coder.js";
import { TypeCoder } from "./type-coder.js";
import { normalizeOpenApiPath } from "./openapi-path.js";
import { Requirement } from "./requirement.js";
import type { RequirementData } from "./requirement.js";
import type { Script } from "./script.js";

export interface SecurityScheme {
  in?: "cookie" | "header" | "query";
  name?: string;
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
 * **Versioned APIs** register a declaration builder on the shared script.
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

  /** Returns the stable HTTP-method identifier, independent of operationId. */
  public getOperationBaseName(): string {
    return `HTTP_${this.requestMethod.toUpperCase()}`;
  }

  public override jsdoc(): string {
    return buildJsDoc(this.requirement.data);
  }

  public override get exportId(): string {
    return this.version === ""
      ? this.id
      : `${this.constructor.name}@${this.modulePath()}:${this.requestMethod.toLowerCase()}`;
  }

  public override names(): Generator<string> {
    return super.names(this.getOperationBaseName());
  }

  /**
   * Generates and exports a named parameter type (e.g. `HTTP_GET_Query`) from
   * `modulePath` and returns the exported type name.
   *
   * Returns `"never"` without creating an export when `inlineType` is
   * `"never"`.
   *
   * @param script - The script being assembled.
   * @param parameterKind - `"query"`, `"path"`, `"headers"`, or `"cookie"`.
   * @param inlineType - The inline TypeScript type node to export.
   * @param baseName - The base identifier prefix for the exported type name.
   * @param modulePath - The repository-relative path of the type file.
   */
  public exportParameterType(
    script: Script,
    parameterKind: string,
    inlineType: ts.TypeNode,
    baseName: string,
    modulePath: string,
  ): ts.TypeNode {
    if (inlineType.kind === ts.SyntaxKind.NeverKeyword) {
      return inlineType;
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

    return typeReference(script.export(coder, true));
  }

  /**
   * Returns the union of all possible response type shapes for this operation.
   *
   * @param script - The script being assembled (used to resolve imports).
   */
  public responseTypes(script: Script): ts.TypeNode {
    const shapes = this.requirement
      .get("responses")!
      .flatMap((response, code): ts.TypeNode[] => {
        const status =
          code === "default"
            ? unionType([
                numberType(),
                ts.factory.createKeywordTypeNode(
                  ts.SyntaxKind.UndefinedKeyword,
                ),
              ])
            : literalType(Number.parseInt(code, 10));
        const shape = (contentType: string, body: ts.TypeNode): ts.TypeNode =>
          typeLiteral(
            [
              typeProperty("status", status),
              typeProperty("contentType", literalType(contentType), true),
              typeProperty("body", body, true),
            ],
            true,
          );
        if (response.has("content")) {
          return response.get("content")!.map((content, mediaType) => {
            const body =
              content.has("itemSchema") &&
              STREAMING_CONTENT_TYPES.has(mediaType)
                ? typeReference("AsyncIterable", [
                    new SchemaTypeCoder(
                      content.get("itemSchema")!,
                      this.version,
                    ).write(script),
                  ])
                : content.has("schema")
                  ? new SchemaTypeCoder(
                      content.get("schema")!,
                      this.version,
                    ).write(script)
                  : unknownType();
            return shape(mediaType, body);
          });
        }
        if (response.has("schema")) {
          const produces = (
            this.requirement.get("produces") ??
            this.requirement.specification?.rootRequirement?.get("produces")
          )?.data as string[] | undefined;
          if (produces)
            return produces.map((mediaType) =>
              shape(
                mediaType,
                new SchemaTypeCoder(
                  response.get("schema")!,
                  this.version,
                ).write(script),
              ),
            );
        }
        return [typeLiteral([typeProperty("status", status)], true)];
      });
    return unionType(shapes);
  }

  public override modulePath(): string {
    const pathString = normalizeOpenApiPath(
      this.requirement.url.split("/").at(-2)!.replaceAll("~1", "/"),
    );

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
  public userType(): ts.TypeNode {
    return this.securitySchemes.some(
      ({ scheme, type }) => type === "http" && scheme === "basic",
    )
      ? typeLiteral([
          typeProperty("username", stringType(), true),
          typeProperty("password", stringType(), true),
        ])
      : neverType();
  }

  public authType(): ts.TypeNode {
    const fields: ts.TypeElement[] = [];
    if (
      this.securitySchemes.some(
        ({ scheme, type }) => type === "http" && scheme === "basic",
      )
    ) {
      fields.push(
        typeProperty("username", stringType(), true),
        typeProperty("password", stringType(), true),
      );
    }
    if (this.securitySchemes.some(({ type }) => type === "apiKey"))
      fields.push(typeProperty("apiKey", stringType()));
    return fields.length === 0 ? neverType() : typeLiteral(fields);
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
    const apiKeyParameters = this.securitySchemes
      .filter(
        ({ in: location, name, type }) =>
          type === "apiKey" &&
          typeof name === "string" &&
          (location === "header" ||
            location === "query" ||
            location === "cookie"),
      )
      .map(({ in: location, name }) => ({
        in: location,
        name,
        required: true,
        schema: { type: "string" },
      }));

    if (!pathItemParams && !operationParams && apiKeyParameters.length === 0) {
      return undefined;
    }

    if (!pathItemParams && apiKeyParameters.length === 0) {
      return operationParams;
    }

    if (!operationParams && apiKeyParameters.length === 0) {
      return pathItemParams;
    }

    // Merge using a Map keyed on `${in}:${name}`.
    // Path-level params are added first; operation-level and security-level
    // params override them.
    const pathData =
      (pathItemParams?.data as unknown as Record<string, unknown>[]) ?? [];
    const opData =
      (operationParams?.data as unknown as Record<string, unknown>[]) ?? [];

    const map = new Map<string, Record<string, unknown>>();

    for (const p of pathData) {
      map.set(`${p.in as string}:${p.name as string}`, p);
    }

    for (const p of opData) {
      map.set(`${p.in as string}:${p.name as string}`, p);
    }

    for (const p of apiKeyParameters) {
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
  ): ts.TypeNode {
    const xType = script.importSharedType("WideOperationArgument");

    script.importSharedType("OmitValueWhenNever");
    script.importSharedType("COUNTERFACT_RESPONSE");

    const contextTypeImportName = script.importExternalType("Context", {
      context: true,
    });

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
                parameter.get("in")?.data as string,
              ),
            )
            ?.get("schema")
        : this.requirement.select(
            "requestBody/content/application~1json/schema",
          );

    const bodyType =
      bodyRequirement === undefined
        ? neverType()
        : new SchemaTypeCoder(bodyRequirement, this.version).write(script);

    const openApi2MediaTypes = (this.requirement.get("produces")?.data ??
      this.requirement.specification?.rootRequirement?.get("produces")
        ?.data) as string[] | undefined;

    const responseType = new ResponsesTypeCoder(
      this.requirement.get("responses")!,
      this.version,
      openApi2MediaTypes,
    ).write(script);

    const proxyType = functionType(
      [parameter("url", stringType())],
      typeReference("COUNTERFACT_RESPONSE"),
    );

    const delayType = functionType(
      [
        parameter("milliseconds", numberType()),
        parameter("maxMilliseconds", numberType(), true),
      ],
      typeReference("Promise", [
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
      ]),
    );

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
        : neverType();
    const querystringTypeName = this.exportParameterType(
      script,
      "querystring",
      querystringType,
      baseName,
      modulePath,
    );

    const versionLiteralType =
      this.version !== "" ? literalType(this.version) : neverType();
    return typeReference("OmitValueWhenNever", [
      typeLiteral([
        typeProperty("query", queryTypeName),
        typeProperty("querystring", querystringTypeName),
        typeProperty("path", pathTypeName),
        typeProperty("headers", headersTypeName),
        typeProperty("cookie", cookieTypeName),
        typeProperty("body", bodyType),
        typeProperty("context", typeReference(contextTypeImportName)),
        typeProperty("response", responseType),
        typeProperty("x", typeReference(xType)),
        typeProperty("proxy", proxyType),
        typeProperty("auth", this.authType()),
        typeProperty("user", this.userType()),
        typeProperty("delay", delayType),
        typeProperty("version", versionLiteralType),
      ]),
    ]);
  }

  public override exportDeclarations(
    script: Script,
    name: string,
  ): ts.Statement[] | undefined {
    if (this.version === "") return undefined;
    script.comments = READ_ONLY_COMMENTS;
    const versioned = script.importVersionsType("Versioned");
    const promise = script.importSharedType("MaybePromise");
    const response = script.importSharedType("COUNTERFACT_RESPONSE");
    script.setVersionBuilder(this.getOperationBaseName(), (versions) => {
      const mapName = `${name}_$_Versions`;
      return [
        typeAlias(
          mapName,
          typeLiteral(
            [...versions].map(([version, type]) => typeProperty(version, type)),
          ),
          false,
        ),
        typeAlias(
          name,
          functionType(
            [
              parameter(
                "$",
                typeReference(versioned, [typeReference(mapName)]),
              ),
            ],
            typeReference(promise, [typeReference(response)]),
          ),
        ),
      ];
    });
    return [];
  }

  public override writeCode(script: Script): ts.TypeNode {
    script.comments = READ_ONLY_COMMENTS;
    script.importSharedType("WideOperationArgument");
    script.importSharedType("OmitValueWhenNever");
    script.importSharedType("MaybePromise");
    script.importSharedType("COUNTERFACT_RESPONSE");
    const arg = this.buildDollarArgType(
      script,
      this.getOperationBaseName(),
      this.modulePath(),
    );
    return functionType(
      [parameter("$", arg)],
      typeReference("MaybePromise", [typeReference("COUNTERFACT_RESPONSE")]),
    );
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
  public override get exportId(): string {
    return this.id;
  }

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
  public override exportDeclarations(): undefined {
    return undefined;
  }

  public override write(script: Script): ts.TypeNode {
    if (script.path === this.modulePath()) {
      return this.writeCode(script);
    }

    return typeReference(script.importType(this));
  }

  /**
   * Generates the `OmitValueWhenNever<{…}>` dollar-argument type and writes
   * it to the per-version script.
   */
  public override writeCode(script: Script): ts.TypeNode {
    script.comments = READ_ONLY_COMMENTS;
    return this.buildDollarArgType(
      script,
      this.getOperationBaseName(),
      this.modulePath(),
    );
  }
}
