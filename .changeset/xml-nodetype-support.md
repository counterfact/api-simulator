---
"counterfact": minor
---

Support OpenAPI 3.2 `xml.nodeType` field in JSON-to-XML serialisation.

- `nodeType: "attribute"` serialises the value as an XML attribute.
- `nodeType: "text"` serialises the value as an XML text node (no child element wrapper).
- `nodeType: "cdata"` serialises the value as a CDATA section.
- `nodeType: "none"` omits the property from the XML output entirely.
- `nodeType: "element"` wraps the value in a child element (default behaviour); for arrays it is a synonym for the deprecated `xml.wrapped: true`.
- The deprecated `xml.attribute: true` continues to behave identically to `nodeType: "attribute"`.
- The deprecated `xml.wrapped: true` continues to behave identically to `nodeType: "element"` for arrays.
