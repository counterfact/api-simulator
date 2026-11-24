import ts from "typescript";

import {
  exportedConst,
  literalType,
  neverType,
  stringType,
  typeAlias,
  typeLiteral,
  typeProperty,
  typeReference,
  unionType,
  unknownType,
  valueExpression,
} from "./ast.js";
import {
  clientSecurityRequirements,
  clientSecuritySchemes,
} from "./client-security.js";
import { ClientResponseSchemas } from "./client-response-schemas.js";
import { pathOperations } from "./path-operations.js";
import { Repository } from "./repository.js";
import { standaloneClientValidators } from "./standalone-client-validators.js";
import { SchemaTypeCoder } from "./schema-type-coder.js";
import type { Requirement } from "./requirement.js";
import type { Script } from "./script.js";
import type { Specification } from "./specification.js";

const locations = new Map([
  ["path", "path"],
  ["query", "query"],
  ["header", "headers"],
  ["cookie", "cookies"],
]);

const undefinedType = () =>
  ts.factory.createKeywordTypeNode(ts.SyntaxKind.UndefinedKeyword);
const isJson = (mediaType: string) =>
  mediaType === "application/json" || mediaType.endsWith("+json");

function schemaType(
  schema: Requirement | undefined,
  script: Script,
): ts.TypeNode {
  return schema ? new SchemaTypeCoder(schema).write(script) : unknownType();
}

function parametersFor(operation: Requirement) {
  const parameters = new Map<string, Requirement>();
  for (const scope of [operation.parent, operation]) {
    scope?.get("parameters")?.forEach((parameter) => {
      parameters.set(
        `${String(parameter.get("in")?.data)}:${String(parameter.get("name")?.data)}`,
        parameter,
      );
    });
  }
  const supported = [];
  for (const parameter of parameters.values()) {
    const place = String(parameter.get("in")?.data);
    const location = locations.get(place);
    if (location === undefined) return undefined;
    supported.push({ parameter, place, location });
  }
  return supported;
}

function requestBodyType(
  mediaType: string,
  media: Requirement,
  script: Script,
): ts.TypeNode {
  if (isJson(mediaType)) {
    return schemaType(media.get("schema"), script);
  }
  if (mediaType.startsWith("text/")) return stringType();
  if (mediaType === "application/octet-stream") {
    return unionType([typeReference("Blob"), typeReference("ArrayBuffer")]);
  }
  if (mediaType === "multipart/form-data") return typeReference("FormData");
  if (mediaType === "application/x-www-form-urlencoded")
    return typeReference("URLSearchParams");
  return neverType();
}

function responseBodyType(
  mediaType: string,
  media: Requirement,
  script: Script,
): ts.TypeNode {
  if (isJson(mediaType)) return schemaType(media.get("schema"), script);
  if (mediaType.startsWith("text/")) return stringType();
  return typeReference("ArrayBuffer");
}

function describe(
  operation: Requirement,
  method: string,
  script: Script,
  schemas: ClientResponseSchemas,
) {
  const operationParameters = parametersFor(operation);
  if (operationParameters === undefined) return undefined;
  const inputs = new Map<string, ts.TypeElement[]>(
    [...locations.values()].map((location) => [location, []]),
  );
  const parameters = operationParameters.map(
    ({ parameter, place, location }) => {
      const name = String(parameter.get("name")?.data);
      const required =
        place === "path" || parameter.get("required")?.data === true;
      const style = String(
        parameter.get("style")?.data ??
          (place === "query" || place === "cookie" ? "form" : "simple"),
      );
      const explode =
        (parameter.get("explode")?.data ?? style === "form") === true;
      const [content] =
        parameter.get("content")?.map((value, type) => ({ value, type })) ?? [];
      const schema = content?.value.get("schema") ?? parameter.get("schema");
      inputs
        .get(location)
        ?.push(
          typeProperty(
            name,
            schemaType(schema, script),
            !required,
            parameter.data,
          ),
        );
      return {
        name,
        location,
        required,
        style,
        explode,
        allowReserved:
          parameter.get("allowReserved")?.data === true || undefined,
        contentType: content?.type.toLowerCase(),
      };
    },
  );

  const requestBody = operation.get("requestBody");
  const bodyRequired = requestBody?.get("required")?.data === true;
  const media =
    requestBody?.get("content")?.map((value, type) => ({
      value,
      type: type.toLowerCase(),
    })) ?? [];
  const selected = media.find(({ type }) => isJson(type)) ?? media[0];
  const bodyType = selected
    ? requestBodyType(selected.type, selected.value, script)
    : neverType();

  const responseMetadata = new Map<string, string[]>();
  const responseSchemas = new Map<string, Record<string, string>>();
  const responseTypes =
    operation.get("responses")?.map((response, key) => {
      const status =
        key.toUpperCase() === "DEFAULT" ? "default" : key.toUpperCase();
      const noBody =
        method === "head" || ["204", "205", "304"].includes(status);
      const content = noBody
        ? []
        : (response.get("content")?.map((value, type) => ({
            type: type.toLowerCase(),
            value,
          })) ?? []);
      responseMetadata.set(
        status,
        content.map(({ type }) => type),
      );
      const validation = content.flatMap(({ type, value }) => {
        const schema = value.get("schema");
        return schema && (isJson(type) || type.startsWith("text/"))
          ? [[type, schemas.add(schema)] as const]
          : [];
      });
      if (validation.length > 0)
        responseSchemas.set(status, Object.fromEntries(validation));

      return typeProperty(
        status,
        content.length === 0
          ? typeLiteral([
              typeProperty("mediaType", undefinedType()),
              typeProperty("body", undefinedType()),
            ])
          : unionType(
              content.map(({ type, value }) =>
                typeLiteral([
                  typeProperty("mediaType", literalType(type)),
                  typeProperty("body", responseBodyType(type, value, script)),
                ]),
              ),
            ),
      );
    }) ?? [];

  return {
    type: typeLiteral([
      ...[...inputs].map(([name, properties]) =>
        typeProperty(name, typeLiteral(properties)),
      ),
      typeProperty("bodyRequired", literalType(bodyRequired)),
      typeProperty("body", bodyType),
      typeProperty("responses", typeLiteral(responseTypes)),
    ]),
    metadata: {
      parameters,
      body: selected && { mediaType: selected.type, required: bodyRequired },
      responses: Object.fromEntries(responseMetadata),
      security: clientSecurityRequirements(operation),
      responseSchemas:
        responseSchemas.size > 0
          ? Object.fromEntries(responseSchemas)
          : undefined,
    },
  };
}

export async function generateClient(
  specification: Specification,
  destination: string,
  version: string,
): Promise<string[]> {
  if (specification.getRequirement("#/swagger") !== undefined) {
    throw new Error("Fetch client generation requires an OpenAPI 3.x document");
  }
  const repository = new Repository();
  const script = repository.get("index.ts");
  script.reservedNames.add("Operations");
  script.reservedNames.add("createClient");
  script.comments.push("Generated by Counterfact. Do not edit.");
  const runtime = "@counterfact/client/fetch";
  const factory = script.importExternal("createFetchRoute", runtime);
  const options = script.importExternalType("FetchClientOptions", runtime);
  const security = clientSecuritySchemes(specification);
  const provider = security.length
    ? script.importExternalType("CredentialProvider", runtime)
    : undefined;
  const cookie = security.some(
    ({ scheme }) => scheme.type === "apiKey" && scheme.location === "cookie",
  )
    ? script.importExternalType("CookieCredential", runtime)
    : undefined;
  const auth = provider
    ? typeLiteral(
        security.map(({ name, scheme }) =>
          typeProperty(
            name,
            typeReference(provider, [
              scheme.type === "apiKey" && scheme.location === "cookie"
                ? typeReference(cookie!)
                : stringType(),
            ]),
            true,
          ),
        ),
      )
    : neverType();
  const securityMetadata = Object.fromEntries(
    security.map(({ name, scheme }) => [name, scheme]),
  );
  const validation = new ClientResponseSchemas(specification);
  const paths =
    specification.getRequirement("#/paths")?.flatMap((pathItem, path) => {
      const operations = pathOperations(pathItem).flatMap(
        ([operation, method]) => {
          if (["trace", "connect", "track"].includes(method)) return [];
          const description = describe(operation, method, script, validation);
          return description ? [{ method, ...description }] : [];
        },
      );
      return operations.length ? [{ path, operations }] : [];
    }) ?? [];
  const schemaMetadata = validation.output();
  // Always replace this generated module so removing response schemas doesn't leave old validators behind.
  const validators = script.importExternal(
    "responseValidators",
    "./response-validators.js",
  );
  const validatorSource = schemaMetadata
    ? await standaloneClientValidators(schemaMetadata)
    : "// Generated by Counterfact. Do not edit.\nexport const responseValidators = {};\n";
  script.statementBuilders.set("client", () => {
    const {
      createArrowFunction,
      createCallExpression,
      createIdentifier,
      createParameterDeclaration,
      createToken,
    } = ts.factory;
    const metadata = Object.fromEntries(
      paths.map(({ path, operations }) => [
        path,
        Object.fromEntries(
          operations.map(({ method, metadata }) => [method, metadata]),
        ),
      ]),
    );
    return [
      typeAlias(
        "Operations",
        typeLiteral(
          paths.map(({ path, operations }) =>
            typeProperty(
              path,
              typeLiteral(
                operations.map(({ method, type }) =>
                  typeProperty(method, type),
                ),
              ),
            ),
          ),
        ),
      ),
      exportedConst(
        "createClient",
        createArrowFunction(
          undefined,
          undefined,
          [
            createParameterDeclaration(
              undefined,
              undefined,
              "options",
              undefined,
              typeReference(options, [auth]),
            ),
          ],
          undefined,
          createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          createCallExpression(
            createIdentifier(factory),
            [typeReference("Operations")],
            [
              valueExpression(metadata),
              createIdentifier("options"),
              createIdentifier(validators),
              ...(security.length ? [valueExpression(securityMetadata)] : []),
            ],
          ),
        ),
      ),
    ];
  });
  return repository.writeGeneratedScripts(
    destination,
    version,
    new Map([["response-validators.ts", validatorSource]]),
  );
}
