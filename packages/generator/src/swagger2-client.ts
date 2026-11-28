import type { Requirement } from "./requirement.js";
import type { Specification } from "./specification.js";

const multipart = "multipart/form-data";
const urlEncoded = "application/x-www-form-urlencoded";

export function isSwagger2(specification: Specification | undefined): boolean {
  return specification?.getRequirement("#/swagger")?.data === "2.0";
}

function list(requirement: Requirement | undefined) {
  const { data } = requirement ?? {};
  return Array.isArray(data)
    ? data.filter((value): value is string => typeof value === "string")
    : [];
}

function mediaTypes(operation: Requirement, key: "consumes" | "produces") {
  return list(
    operation.get(key) ?? operation.specification?.getRequirement(`#/${key}`),
  ).map((type) => type.toLowerCase());
}

export function swaggerCollection(parameter: Requirement) {
  if (parameter.get("type")?.data !== "array") return undefined;
  const format = parameter.get("collectionFormat")?.data;
  switch (format) {
    case "multi":
    case "ssv":
    case "tsv":
    case "pipes":
      return format;
    default:
      return "csv";
  }
}

export function swaggerParameterSchema(parameter: Requirement): Requirement {
  while (parameter.isReference) parameter = parameter.reference();
  return parameter;
}

export function swaggerBody(
  operation: Requirement,
  parameters: readonly Requirement[],
) {
  const content = mediaTypes(operation, "consumes");
  const body = parameters.find(
    (parameter) => parameter.get("in")?.data === "body",
  );
  if (body) {
    return {
      media: (content.length ? content : ["application/json"]).map((type) => ({
        type,
        schema: body.get("schema"),
      })),
      required: body.get("required")?.data === true,
      fields: undefined,
    };
  }
  const fields = parameters
    .filter((parameter) => parameter.get("in")?.data === "formData")
    .map((parameter) => ({
      name: String(parameter.get("name")?.data),
      required: parameter.get("required")?.data === true,
      file: parameter.get("type")?.data === "file",
      collectionFormat: swaggerCollection(parameter),
      schema: swaggerParameterSchema(parameter),
    }));

  if (fields.length === 0) return undefined;
  const type = fields.some(({ file }) => file)
    ? multipart
    : (content.find((media) => media === urlEncoded || media === multipart) ??
      urlEncoded);
  return {
    media: [{ type, schema: undefined }],
    required: fields.some(({ required }) => required),
    fields,
  };
}

export function swaggerResponse(operation: Requirement, response: Requirement) {
  const schema = response.get("schema");
  if (!schema) return [];
  const file = schema.get("type")?.data === "file";
  const types = mediaTypes(operation, "produces");
  return (
    types.length
      ? types
      : [file ? "application/octet-stream" : "application/json"]
  ).map((type) => ({ type, schema: file ? undefined : schema }));
}

export function swaggerServer(specification: Specification) {
  const source = specification.rootRequirement.url;
  const origin =
    /^https?:\/\//iu.test(source) && URL.canParse(source)
      ? new URL(source)
      : undefined;
  const host = specification.getRequirement("#/host")?.data ?? origin?.host;
  const basePath = specification.getRequirement("#/basePath")?.data;
  const path = typeof basePath === "string" && basePath !== "/" ? basePath : "";
  const scheme =
    list(specification.getRequirement("#/schemes")).find(
      (value) => value === "http" || value === "https",
    ) ??
    origin?.protocol.slice(0, -1) ??
    "https";
  if (typeof host !== "string" || host === "") return path;
  return `${scheme}://${host}${path}`;
}
