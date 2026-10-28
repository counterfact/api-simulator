const orderItem = {
  type: "object",
  required: ["productId", "quantity"],
  properties: {
    productId: { type: "string", minLength: 1 },
    quantity: { type: "integer", minimum: 1 },
  },
};
const item = { $ref: "#/components/schemas/OrderItem" };
const product = {
  type: "object",
  required: ["id", "name", "description", "price", "stock"],
  properties: {
    id: { type: "string", minLength: 1, maxLength: 32 },
    name: {
      type: "string",
      minLength: 1,
      maxLength: 40,
      examples: [
        "House Blend",
        "Dark Roast",
        "Decaf",
        "Breakfast Blend",
        "Colombian Supremo",
        "Ethiopian Yirgacheffe",
        "Sumatra Mandheling",
        "Guatemala Antigua",
        "Costa Rica Tarrazú",
        "Espresso Blend",
      ],
    },
    description: { type: "string", maxLength: 120 },
    price: { type: "integer", minimum: 500, maximum: 2500 },
    stock: { type: "integer", minimum: 0, maximum: 20 },
  },
};
const jsonResponse = (schema: object) => ({
  description: "Coffee shop response",
  content: { "application/json": { schema } },
});
const errorResponse = jsonResponse({
  type: "object",
  required: ["error"],
  properties: { error: { type: "string" } },
});
export const SHOP_DOCUMENT = {
  openapi: "3.1.0",
  info: { title: "Counterfact Coffee", version: "1.0.0" },
  components: { schemas: { Product: product, OrderItem: orderItem } },
  servers: [{ url: "/shop" }],
  paths: {
    "/products": {
      get: {
        responses: {
          "200": jsonResponse({
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: { $ref: "#/components/schemas/Product" },
          }),
        },
      },
    },
    "/orders": {
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["items"],
                properties: {
                  items: { type: "array", minItems: 1, items: item },
                },
              },
            },
          },
        },
        responses: {
          "201": jsonResponse({
            type: "object",
            required: ["orderId", "items"],
            properties: {
              orderId: { type: "integer" },
              items: { type: "array", items: item },
            },
          }),
          "409": jsonResponse({
            type: "object",
            required: ["error", "shortages"],
            properties: {
              error: { type: "string" },
              shortages: {
                type: "array",
                items: {
                  type: "object",
                  required: ["productId", "requested", "available"],
                  properties: {
                    productId: { type: "string" },
                    requested: { type: "integer" },
                    available: { type: "integer", minimum: 0 },
                  },
                },
              },
            },
          }),
          "503": errorResponse,
        },
      },
    },
  },
};
