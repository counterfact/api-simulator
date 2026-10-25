import { STREAMING_CONTENT_TYPES } from "@counterfact/types/streaming-content-types";

import { pathJoin } from "./forward-slash-path.js";
import ts from "typescript";
import { parameter, typeReference } from "./ast.js";
import { Coder } from "./coder.js";
import { normalizeOpenApiPath } from "./openapi-path.js";
import {
  OperationTypeCoder,
  VersionedArgTypeCoder,
  type SecurityScheme,
} from "./operation-type-coder.js";
import type { Requirement } from "./requirement.js";
import type { Script } from "./script.js";

/**
 * Generates the default route handler stub for a single OpenAPI operation.
 *
 * The generated stub calls `$.response.status(statusCode).random()` (or `.empty()`)
 * for the first response defined in the spec.  It is only written when no
 * handler file exists yet — users are expected to replace it with real logic.
 *
 * The corresponding TypeScript type is emitted by {@link OperationTypeCoder}
 * into the `types/paths/…` tree.
 */
export class OperationCoder extends Coder {
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

  public override get exportId(): string {
    return this.version === ""
      ? this.id
      : `${this.constructor.name}@${this.modulePath()}:${this.requestMethod.toLowerCase()}`;
  }

  public override names(): Generator<string> {
    return super.names(this.requestMethod.toUpperCase());
  }

  public override write(): ts.Expression {
    const responses = this.requirement.get("responses")!;
    const [status] = responses.map((_response, code) => code);
    const [response] = responses.map(
      (item) => item.data as Record<string, unknown>,
    );
    const content = response?.content as
      Record<string, { itemSchema?: unknown }> | undefined;
    const streaming =
      content !== undefined &&
      Object.keys(content).some(
        (media) =>
          STREAMING_CONTENT_TYPES.has(media) &&
          content[media]?.itemSchema !== undefined,
      );
    const method = streaming
      ? "stream"
      : response !== undefined &&
          ("content" in response || "schema" in response)
        ? "random"
        : "empty";
    const statements: ts.Statement[] = [];
    if (streaming) {
      const placeholder = ts.factory.createNotEmittedStatement(
        ts.factory.createIdentifier("items"),
      );
      ts.addSyntheticLeadingComment(
        placeholder,
        ts.SyntaxKind.SingleLineCommentTrivia,
        " yield items here",
        true,
      );
      const body = ts.factory.createBlock([placeholder], true);
      statements.push(
        ts.factory.createFunctionDeclaration(
          [ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
          ts.factory.createToken(ts.SyntaxKind.AsteriskToken),
          "items",
          undefined,
          [],
          undefined,
          body,
        ),
      );
    }
    const result = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(
            ts.factory.createPropertyAccessExpression(
              ts.factory.createIdentifier("$"),
              "response",
            ),
            "status",
          ),
          undefined,
          [
            /^\d+$/u.test(status ?? "")
              ? ts.factory.createNumericLiteral(status!)
              : status === "default"
                ? ts.factory.createNumericLiteral(200)
                : ts.factory.createStringLiteral(status ?? "200"),
          ],
        ),
        method,
      ),
      undefined,
      streaming
        ? [
            ts.factory.createCallExpression(
              ts.factory.createIdentifier("items"),
              undefined,
              [],
            ),
          ]
        : [],
    );
    statements.push(ts.factory.createReturnStatement(result));
    return ts.factory.createArrowFunction(
      [ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
      undefined,
      [parameter("$")],
      undefined,
      ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      ts.factory.createBlock(statements, true),
    );
  }

  public override typeDeclaration(
    _namespace: Map<string, unknown> | undefined,
    script: Script,
  ): ts.TypeNode {
    const operationTypeCoder = new OperationTypeCoder(
      this.requirement,
      this.version,
      this.requestMethod,
      this.securitySchemes,
    );

    if (this.version !== "") {
      // For versioned APIs: register this version's $-argument type on the
      // shared script so that Script.versionsTypeStatements() can emit the
      // merged handler type after all versions have been declared.
      const versionedArgCoder = new VersionedArgTypeCoder(
        this.requirement,
        this.version,
        this.requestMethod,
        this.securitySchemes,
      );

      const sharedScript = script.repository.get(
        operationTypeCoder.modulePath(),
      );

      sharedScript.declareVersion(
        versionedArgCoder,
        operationTypeCoder.getOperationBaseName(),
      );
    }

    return typeReference(script.importType(operationTypeCoder));
  }

  public override modulePath(): string {
    const pathString = normalizeOpenApiPath(
      this.requirement.url.split("/").at(-2)!.replaceAll("~1", "/"),
    );

    return `${pathJoin("routes", pathString)}.types.ts`;
  }
}
