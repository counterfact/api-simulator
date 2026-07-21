import { pathJoin } from "../util/forward-slash-path.js";
import { Coder } from "./coder.js";
import {
  OperationTypeCoder,
  VersionedArgTypeCoder,
  type SecurityScheme,
} from "./operation-type-coder.js";
import type { Requirement } from "./requirement.js";
import type { Script } from "./script.js";
import { STREAMING_CONTENT_TYPES } from "./streaming-content-types.js";

/**
 * Generates the default route handler stub for a single OpenAPI operation.
 *
 * The generated stub calls `$.response[statusCode].random()` (or `.empty()`)
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

  public override names(): Generator<string> {
    return super.names(this.requestMethod.toUpperCase());
  }

  public override write(): string {
    const responses = this.requirement.get("responses")!;

    const [firstStatusCode] = responses.map(
      (_response, statusCode) => statusCode,
    );
    const [firstResponse] = responses.map(
      (response) => response.data as Record<string, unknown>,
    );

    if (
      firstResponse === undefined ||
      !("content" in firstResponse || "schema" in firstResponse)
    ) {
      return `async ($) => {
        return $.response[${
          firstStatusCode === "default" ? 200 : firstStatusCode
        }].empty();
      }`;
    }

    // Detect streaming responses (OpenAPI 3.2 itemSchema)
    const content = firstResponse.content as
      Record<string, { itemSchema?: unknown }> | undefined;
    const hasStreamingContent =
      content !== undefined &&
      Object.keys(content).some(
        (ct) =>
          STREAMING_CONTENT_TYPES.has(ct) &&
          content[ct]?.itemSchema !== undefined,
      );

    if (hasStreamingContent) {
      return `async ($) => {
        async function* items() {
          // yield items here
        }
        return $.response[${
          firstStatusCode === "default" ? 200 : firstStatusCode
        }].stream(items());
      }`;
    }

    return `async ($) => {
      return $.response[${
        firstStatusCode === "default" ? 200 : firstStatusCode
      }].random();
    }`;
  }

  public override typeDeclaration(
    _namespace: Map<string, unknown> | undefined,
    script: Script,
  ): string {
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

    return script.importType(operationTypeCoder);
  }

  public override modulePath(): string {
    const pathString = this.requirement.url
      .split("/")
      .at(-2)!
      .replaceAll("~1", "/");

    return `${pathJoin("routes", pathString)}.types.ts`;
  }
}
