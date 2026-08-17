import { printObjectWithoutQuotes } from "./printers.js";
import { ResponseTypeCoder } from "./response-type-coder.js";
import { TypeCoder } from "./type-coder.js";
import type { Requirement } from "./requirement.js";
import type { Script } from "./script.js";

export class ResponsesTypeCoder extends TypeCoder {
  public openApi2MediaTypes: string[];

  public constructor(
    requirement: Requirement,
    version = "",
    openApi2MediaTypes: string[] = [],
  ) {
    super(requirement, version);

    this.openApi2MediaTypes = openApi2MediaTypes;
  }

  public typeForDefaultStatusCode(listedStatusCodes: string[]): string {
    const definedStatusCodes = listedStatusCodes.filter(
      (key) => key !== "default",
    );

    if (definedStatusCodes.length === 0) {
      return "[statusCode in HttpStatusCode]";
    }

    return `[statusCode in Exclude<HttpStatusCode, ${definedStatusCodes.join(
      " | ",
    )}>]`;
  }

  public normalizeStatusCode(statusCode: string): string {
    if (statusCode === "default") {
      return this.typeForDefaultStatusCode(
        Object.keys(this.requirement.data as Record<string, unknown>),
      );
    }

    return statusCode;
  }

  public buildResponseObjectType(script: Script): string {
    const entries: [string, string][] = this.requirement.map(
      (response, responseCode): [string, string] => [
        this.normalizeStatusCode(responseCode),
        new ResponseTypeCoder(
          response,
          this.version,
          this.openApi2MediaTypes,
        ).write(script),
      ],
    );

    const explicitEntries = entries.filter(([key]) => !key.startsWith("["));
    const mappedEntries = entries.filter(([key]) => key.startsWith("["));

    if (explicitEntries.length > 0 && mappedEntries.length > 0) {
      return `${printObjectWithoutQuotes(explicitEntries)} & ${printObjectWithoutQuotes(mappedEntries)}`;
    }

    return printObjectWithoutQuotes(entries);
  }

  public override writeCode(script: Script): string {
    script.importSharedType("ResponseBuilderFactory");

    const text = `ResponseBuilderFactory<${this.buildResponseObjectType(
      script,
    )}>`;

    if (text.includes("HttpStatusCode")) {
      script.importSharedType("HttpStatusCode");
    }

    return text;
  }
}
