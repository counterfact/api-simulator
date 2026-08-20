import { jsonToXml } from "../../src/server/json-to-xml.js";

describe("JSON to XML", () => {
  it("converts a JSON object to XML", () => {
    const json = { author: "string", id: 0, title: "string" };

    const schema = {
      properties: {
        author: {
          type: "string",
        },

        id: {
          attribute: true,
          type: "number",
        },

        title: {
          type: "string",
        },
      },
    };
    const xml = jsonToXml(json, schema, "book");

    expect(xml).toBe(
      '<book id="0"><author>string</author><title>string</title></book>',
    );
  });

  it("uses the xml name from the schema", () => {
    const json = { author: "string", id: 0, title: "string" };

    const schema = {
      properties: {
        author: {
          type: "string",
        },

        id: {
          type: "number",
        },

        title: {
          type: "string",
        },
      },

      xml: {
        name: "xml-book",
      },
    };
    const xml = jsonToXml(json, schema, "book");

    expect(xml).toBe(
      "<xml-book><author>string</author><id>0</id><title>string</title></xml-book>",
    );
  });

  it("escapes XML special characters in text content", () => {
    const xml = jsonToXml('<script>alert("xss")</script>', undefined, "data");
    expect(xml).toBe(
      "<data>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</data>",
    );
  });

  it("escapes ampersands in primitive values", () => {
    const xml = jsonToXml("a & b < c > d", undefined, "text");
    expect(xml).toBe("<text>a &amp; b &lt; c &gt; d</text>");
  });

  describe("nodeType", () => {
    it("serialises a property with nodeType: attribute as an XML attribute", () => {
      const json = { id: 42, name: "Alice" };
      const schema = {
        properties: {
          id: { xml: { nodeType: "attribute" } },
          name: { type: "string" },
        },
      };
      const xml = jsonToXml(json, schema, "person");

      expect(xml).toBe('<person id="42"><name>Alice</name></person>');
    });

    it("serialises a property with nodeType: text as a text node (no child element)", () => {
      const json = { content: "hello world" };
      const schema = {
        properties: {
          content: { xml: { nodeType: "text" } },
        },
      };
      const xml = jsonToXml(json, schema, "note");

      expect(xml).toBe("<note>hello world</note>");
    });

    it("escapes special characters in nodeType: text values", () => {
      const json = { content: "a & b" };
      const schema = {
        properties: {
          content: { xml: { nodeType: "text" } },
        },
      };
      const xml = jsonToXml(json, schema, "note");

      expect(xml).toBe("<note>a &amp; b</note>");
    });

    it("serialises a property with nodeType: cdata as a CDATA section", () => {
      const json = { content: "<script>alert('xss')</script>" };
      const schema = {
        properties: {
          content: { xml: { nodeType: "cdata" } },
        },
      };
      const xml = jsonToXml(json, schema, "note");

      expect(xml).toBe(
        "<note><![CDATA[<script>alert('xss')</script>]]></note>",
      );
    });

    it("omits a property with nodeType: none from the XML output", () => {
      const json = { id: 1, secret: "hidden", name: "Alice" };
      const schema = {
        properties: {
          id: { type: "number" },
          secret: { xml: { nodeType: "none" } },
          name: { type: "string" },
        },
      };
      const xml = jsonToXml(json, schema, "person");

      expect(xml).toBe("<person><id>1</id><name>Alice</name></person>");
    });

    it("serialises a property with nodeType: element as a child element (default)", () => {
      const json = { title: "Test" };
      const schema = {
        properties: {
          title: { xml: { nodeType: "element" } },
        },
      };
      const xml = jsonToXml(json, schema, "book");

      expect(xml).toBe("<book><title>Test</title></book>");
    });

    it("wraps an array when nodeType: element is set (synonym for wrapped: true)", () => {
      const json = ["a", "b", "c"];
      const schema = {
        xml: { nodeType: "element", name: "items" },
        items: { type: "string" },
      };
      const xml = jsonToXml(json, schema, "items");

      expect(xml).toBe(
        "<items><items>a</items><items>b</items><items>c</items></items>",
      );
    });

    it("uses xml.name for attribute name when nodeType: attribute is set", () => {
      const json = { identifier: 99 };
      const schema = {
        properties: {
          identifier: { xml: { nodeType: "attribute", name: "id" } },
        },
      };
      const xml = jsonToXml(json, schema, "item");

      expect(xml).toBe('<item id="99"></item>');
    });
  });

  describe("deprecated attribute and wrapped flags", () => {
    it("treats xml.attribute: true as nodeType: attribute", () => {
      const json = { id: 7, label: "foo" };
      const schema = {
        properties: {
          id: { xml: { attribute: true } },
          label: { type: "string" },
        },
      };
      const xml = jsonToXml(json, schema, "item");

      expect(xml).toBe('<item id="7"><label>foo</label></item>');
    });

    it("treats xml.wrapped: true as nodeType: element for arrays", () => {
      const json = ["x", "y"];
      const schema = {
        xml: { wrapped: true, name: "tags" },
        items: { type: "string" },
      };
      const xml = jsonToXml(json, schema, "tags");

      expect(xml).toBe("<tags><tags>x</tags><tags>y</tags></tags>");
    });
  });
});
