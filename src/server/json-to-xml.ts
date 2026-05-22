interface XmlHints {
  attribute?: boolean;
  name?: string;
  namespace?: string;
  nodeType?: "attribute" | "cdata" | "element" | "none" | "text";
  prefix?: string;
  wrapped?: boolean;
}

interface Schema {
  [key: string]: unknown;
  items?: Schema;
  properties?: {
    [key: string]: Schema;
  };
  xml?: XmlHints;
}

function xmlEscape(xmlString: string): string {
  return xmlString.replace(/["&'<>]/gu, (character: string) => {
    switch (character) {
      case "<": {
        return "&lt;";
      }
      case ">": {
        return "&gt;";
      }
      case "&": {
        return "&amp;";
      }
      case "'": {
        return "&apos;";
      }
      case '"': {
        return "&quot;";
      }

      default: {
        return character;
      }
    }
  });
}

function resolveNodeType(
  schema: Schema | undefined,
): "attribute" | "cdata" | "element" | "none" | "text" {
  if (schema?.xml?.nodeType !== undefined) {
    return schema.xml.nodeType;
  }

  if (schema?.xml?.attribute || schema?.attribute) {
    return "attribute";
  }

  return "element";
}

function objectToXml(
  json: object,
  schema: Schema | undefined,
  name: string,
): string {
  const xml: string[] = [];

  const attributes: string[] = [];

  Object.entries(json).forEach(([key, value]) => {
    const properties = Reflect.get(schema?.properties ?? {}, key) as
      | Schema
      | undefined;
    const nodeType = resolveNodeType(properties);
    const xmlName = properties?.xml?.name ?? key;

    switch (nodeType) {
      case "attribute": {
        attributes.push(` ${xmlName}="${xmlEscape(String(value))}"`);
        break;
      }

      case "text": {
        xml.push(xmlEscape(String(value)));
        break;
      }

      case "cdata": {
        xml.push(`<![CDATA[${String(value)}]]>`);
        break;
      }

      case "none": {
        break;
      }

      default: {
        xml.push(jsonToXml(value, properties, key));
      }
    }
  });

  return `<${name}${attributes.join("")}>${xml.join("")}</${name}>`;
}

/**
 * Converts a JSON value to an XML string using optional OpenAPI `xml` schema
 * hints (element names, attributes, wrapping).
 *
 * @param json - The value to serialise.
 * @param schema - Optional JSON Schema with an `xml` hint block.
 * @param keyName - Fallback XML element name when the schema does not provide
 *   one.  Defaults to `"root"`.
 * @returns A well-formed XML string.
 */
export function jsonToXml(
  json: unknown,
  schema: Schema | undefined,
  keyName = "root",
): string {
  const name = schema?.xml?.name ?? keyName;

  if (Array.isArray(json)) {
    const items = json
      .map((item) => jsonToXml(item, schema?.items, name))
      .join("");

    if (schema?.xml?.wrapped || schema?.xml?.nodeType === "element") {
      return `<${name}>${items}</${name}>`;
    }

    return items;
  }

  if (typeof json === "object" && json !== null) {
    return objectToXml(json, schema, name);
  }

  return `<${name}>${xmlEscape(String(json))}</${name}>`;
}
