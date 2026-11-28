import ts from "typescript";

import {
  exportedConst,
  literalType,
  neverType,
  objectExpression,
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
import { ClientMultipartSchemaTypeCoder } from "./client-multipart-schema-type-coder.js";
import { ClientResponseSchemas } from "./client-response-schemas.js";
import {
  namedOperations,
  staOperations,
  type ClientGroupingOptions,
} from "./named-client-operations.js";
import { pathOperations } from "./path-operations.js";
import { Repository } from "./repository.js";
import { standaloneClientValidators } from "./standalone-client-validators.js";
import { SchemaTypeCoder } from "./schema-type-coder.js";
import {
  isSwagger2,
  swaggerBody,
  swaggerCollection,
  swaggerParameterSchema,
  swaggerResponse,
  swaggerServer,
} from "./swagger2-client.js";
import type { Requirement } from "./requirement.js";
import type { Script } from "./script.js";
import type { Specification } from "./specification.js";

const locations = new Map([
  ["path", "path"],
  ["query", "query"],
  ["header", "headers"],
  ["cookie", "cookies"],
]);

const formMediaType = "application/x-www-form-urlencoded";

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

function multipartContentTypes(media: Requirement | undefined) {
  if (!media) return undefined;
  const types = new Map<string, string>();
  media.get("encoding")?.forEach((part, name) => {
    const contentType = part.get("contentType")?.data;
    if (typeof contentType === "string") types.set(name, contentType);
  });
  return types.size ? Object.fromEntries(types) : undefined;
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
  const swagger = isSwagger2(operation.specification);
  let wholeQuery: Requirement | undefined;
  for (const parameter of parameters.values()) {
    const place = String(parameter.get("in")?.data);
    if (place === "querystring") {
      if (wholeQuery !== undefined) return undefined;
      wholeQuery = parameter;
      continue;
    }
    if (swagger && (place === "body" || place === "formData")) continue;
    const location = locations.get(place);
    if (location === undefined) return undefined;
    supported.push({ parameter, place, location });
  }
  if (wholeQuery && supported.some(({ place }) => place === "query"))
    return undefined;
  return { fields: supported, wholeQuery, swagger, parameters };
}

function describeWholeQuery(parameter: Requirement, script: Script) {
  const [content] =
    parameter.get("content")?.map((media, type) => ({
      media,
      type: type.toLowerCase(),
    })) ?? [];
  if (!content || (!isJson(content.type) && content.type !== formMediaType))
    return undefined;

  const { media, type: mediaType } = content;
  const encoding =
    mediaType === formMediaType ? media.get("encoding") : undefined;
  if (
    mediaType === formMediaType &&
    (media.has("prefixEncoding") ||
      media.has("itemEncoding") ||
      encoding?.find(
        (field) =>
          field.has("encoding") ||
          field.has("prefixEncoding") ||
          field.has("itemEncoding"),
      ))
  ) {
    return undefined;
  }

  const required = parameter.get("required")?.data === true;
  return {
    type: typeProperty(
      "querystring",
      typeLiteral([
        typeProperty("value", schemaType(media.get("schema"), script)),
        typeProperty("required", literalType(required)),
      ]),
    ),
    metadata: {
      required,
      mediaType,
      encoding:
        encoding &&
        Object.fromEntries(
          encoding.map((field, name) => [
            name,
            {
              style: field.get("style")?.data,
              explode: field.get("explode")?.data,
              allowReserved: field.get("allowReserved")?.data,
              contentType: field.get("contentType")?.data,
            },
          ]),
        ),
    },
  };
}

function requestBodyType(
  mediaType: string,
  schema: Requirement | undefined,
  script: Script,
): ts.TypeNode {
  if (isJson(mediaType)) {
    return schemaType(schema, script);
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
  schema: Requirement | undefined,
  script: Script,
): ts.TypeNode {
  if (isJson(mediaType)) return schemaType(schema, script);
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
  const { swagger } = operationParameters;
  const wholeQuery =
    operationParameters.wholeQuery &&
    describeWholeQuery(operationParameters.wholeQuery, script);
  if (operationParameters.wholeQuery && !wholeQuery) return undefined;

  const inputs = new Map<string, ts.TypeElement[]>(
    [...locations.values()].map((location) => [location, []]),
  );
  const parameters = operationParameters.fields.map(
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
      const schema = swagger
        ? swaggerParameterSchema(parameter)
        : (content?.value.get("schema") ?? parameter.get("schema"));
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
        collectionFormat: swagger ? swaggerCollection(parameter) : undefined,
      };
    },
  );

  const legacyBody = swagger
    ? swaggerBody(operation, [...operationParameters.parameters.values()])
    : undefined;
  const requestBody = operation.get("requestBody");
  const bodyRequired =
    legacyBody?.required ?? requestBody?.get("required")?.data === true;
  const media =
    legacyBody?.media ??
    requestBody?.get("content")?.map((value, type) => ({
      schema: value.get("schema"),
      type: type.toLowerCase(),
    })) ??
    [];
  const selected = media.find(({ type }) => isJson(type)) ?? media[0];
  const formFields = legacyBody?.fields;
  const formType =
    formFields &&
    typeLiteral(
      formFields.map(({ name, file, required, schema }) =>
        typeProperty(
          name,
          file ? typeReference("Blob") : schemaType(schema, script),
          !required,
          schema.data,
        ),
      ),
    );
  const bodyType = selected
    ? requestBodyType(selected.type, selected.schema, script)
    : neverType();
  const multipartMedia =
    selected?.type === "multipart/form-data" && !swagger
      ? requestBody
          ?.get("content")
          ?.find((_, type) => type.toLowerCase() === selected.type)
      : undefined;
  const multipartEncoding = multipartMedia?.get("encoding");
  const multipartSchema = multipartMedia && selected?.schema;
  const multipartType = multipartSchema
    ? new ClientMultipartSchemaTypeCoder(
        multipartSchema,
        "",
        "root",
        false,
        multipartEncoding,
      ).write(script)
    : undefined;
  const structuredBody = formType ?? multipartType;

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
        : swagger
          ? swaggerResponse(operation, response)
          : (response.get("content")?.map((value, type) => ({
              type: type.toLowerCase(),
              schema: value.get("schema"),
            })) ?? []);
      responseMetadata.set(
        status,
        content.map(({ type }) => type),
      );
      const validation = content.flatMap(({ type, schema }) => {
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
              content.map(({ type, schema }) =>
                typeLiteral([
                  typeProperty("mediaType", literalType(type)),
                  typeProperty("body", responseBodyType(type, schema, script)),
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
      ...(wholeQuery ? [wholeQuery.type] : []),
      typeProperty("bodyRequired", literalType(bodyRequired)),
      typeProperty(
        "body",
        structuredBody ? unionType([structuredBody, bodyType]) : bodyType,
      ),
      ...(selected &&
      ["multipart/form-data", formMediaType].includes(selected.type)
        ? [
            typeProperty(
              "adapterBody",
              formType ??
                (multipartSchema
                  ? new ClientMultipartSchemaTypeCoder(
                      multipartSchema,
                      "",
                      "root",
                      true,
                      multipartEncoding,
                    ).write(script)
                  : schemaType(selected.schema, script)),
            ),
          ]
        : []),
      typeProperty("responses", typeLiteral(responseTypes)),
    ]),
    metadata: {
      parameters,
      querystring: wholeQuery?.metadata,
      body: selected && {
        mediaType: selected.type,
        required: bodyRequired,
        formFields: formFields?.map(({ schema: _schema, ...field }) => field),
        multipartContentTypes: multipartContentTypes(multipartMedia),
      },
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
  grouping: ClientGroupingOptions = {},
): Promise<string[]> {
  const swagger = isSwagger2(specification);
  if (!swagger && specification.getRequirement("#/swagger")) {
    throw new Error(
      "Fetch client generation supports Swagger 2.0 and OpenAPI 3.x",
    );
  }
  const version2Server = swagger ? swaggerServer(specification) : undefined;
  const defaultBaseUrl = version2Server?.startsWith("http")
    ? version2Server
    : undefined;
  const repository = new Repository();
  const script = repository.get("index.ts");
  for (const name of [
    "Operations",
    "createClient",
    "createSdk",
    "operations",
    "sdkOperations",
    "adapterOperations",
  ]) {
    script.reservedNames.add(name);
  }
  script.comments.push("Generated by Counterfact. Do not edit.");
  const runtime = "@counterfact/client/fetch";
  const factory = script.importExternal("createFetchRoute", runtime);
  const sdkFactory = script.importExternal("defineFetchSdk", runtime);
  const fetchOperations = script.importExternalType("FetchOperations", runtime);
  const options = script.importExternalType(
    defaultBaseUrl ? "FetchClientOptionsWithDefault" : "FetchClientOptions",
    runtime,
  );
  const security = clientSecuritySchemes(specification);
  const provider = security.length
    ? script.importExternalType("CredentialProvider", runtime)
    : undefined;
  const cookie = security.some(
    ({ scheme }) => scheme.type === "apiKey" && scheme.location === "cookie",
  )
    ? script.importExternalType("CookieCredential", runtime)
    : undefined;
  const basic = security.some(({ scheme }) => scheme.type === "basic")
    ? script.importExternalType("BasicCredential", runtime)
    : undefined;
  const auth = provider
    ? typeLiteral(
        security.map(({ name, scheme }) =>
          typeProperty(
            name,
            typeReference(provider, [
              scheme.type === "apiKey" && scheme.location === "cookie"
                ? typeReference(cookie!)
                : scheme.type === "basic"
                  ? typeReference(basic!)
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
          if (!description) return [];
          const operationId = operation.get("operationId")?.data;
          const tags = operation.get("tags")?.data;
          return [
            {
              method,
              ...description,
              operationId:
                typeof operationId === "string" ? operationId : undefined,
              tags: Array.isArray(tags)
                ? tags.filter((tag): tag is string => typeof tag === "string")
                : [],
            },
          ];
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
    const operationType = typeReference("Operations");
    const identifier = createIdentifier("operations");
    const sdkIdentifier = createIdentifier("sdkOperations");
    const adapterIdentifier = createIdentifier("adapterOperations");
    const serverUrl =
      version2Server ?? specification.getRequirement("#/servers/0/url")?.data;
    const constExpression = (value: unknown) =>
      ts.factory.createAsExpression(
        valueExpression(value),
        typeReference("const"),
      );
    const optionsIdentifier = createIdentifier("options");
    const sharedArgs = [
      createIdentifier(validators),
      ...(security.length ? [valueExpression(securityMetadata)] : []),
    ];
    const declareConst = (
      name: ts.Identifier,
      value: ts.Expression,
      type?: ts.TypeNode,
    ) =>
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(name, undefined, type, value)],
          ts.NodeFlags.Const,
        ),
      );
    const defineFactory = (
      name: string,
      runtimeFactory: string,
      typeArguments: ts.TypeNode[],
      args: ts.Expression[],
    ) =>
      exportedConst(
        name,
        createArrowFunction(
          undefined,
          undefined,
          [
            createParameterDeclaration(
              undefined,
              undefined,
              optionsIdentifier,
              defaultBaseUrl
                ? createToken(ts.SyntaxKind.QuestionToken)
                : undefined,
              typeReference(options, [auth]),
            ),
          ],
          undefined,
          createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          createCallExpression(
            createIdentifier(runtimeFactory),
            typeArguments,
            args,
          ),
        ),
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
      declareConst(
        identifier,
        valueExpression(metadata),
        typeReference(fetchOperations, [operationType]),
      ),
      declareConst(
        sdkIdentifier,
        constExpression(namedOperations(paths, grouping)),
      ),
      declareConst(
        adapterIdentifier,
        constExpression(staOperations(paths, grouping)),
      ),
      defineFactory(
        "createClient",
        factory,
        [operationType],
        [
          identifier,
          defaultBaseUrl
            ? ts.factory.createObjectLiteralExpression([
                ts.factory.createSpreadAssignment(optionsIdentifier),
                ts.factory.createPropertyAssignment(
                  "baseUrl",
                  ts.factory.createBinaryExpression(
                    ts.factory.createPropertyAccessChain(
                      optionsIdentifier,
                      createToken(ts.SyntaxKind.QuestionDotToken),
                      "baseUrl",
                    ),
                    createToken(ts.SyntaxKind.QuestionQuestionToken),
                    valueExpression(defaultBaseUrl),
                  ),
                ),
              ])
            : optionsIdentifier,
          ...sharedArgs,
        ],
      ),
      exportedConst(
        "createSdk",
        createCallExpression(
          createIdentifier(sdkFactory),
          [
            operationType,
            ts.factory.createTypeQueryNode(sdkIdentifier),
            ts.factory.createTypeQueryNode(adapterIdentifier),
            auth,
            ...(defaultBaseUrl ? [literalType(defaultBaseUrl)] : []),
          ],
          [
            objectExpression([
              ["operations", identifier],
              ["names", adapterIdentifier],
              [
                "baseUrl",
                valueExpression(typeof serverUrl === "string" ? serverUrl : ""),
              ],
              ...(defaultBaseUrl
                ? [["nativeBaseUrl", valueExpression(defaultBaseUrl)] as const]
                : []),
            ]),
            sdkIdentifier,
            ...sharedArgs,
          ],
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
