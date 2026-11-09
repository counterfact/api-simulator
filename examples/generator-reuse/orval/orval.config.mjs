export default {
  pets: {
    input: "./openapi.yaml",
    output: {
      target: "./generated/client.ts",
      schemas: "./generated/models",
      client: "fetch",
      mode: "single",
    },
  },
};
