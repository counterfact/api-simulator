// These standalone helpers contain no validator compiler. Ajv publishes them
// as CommonJS modules, so native ESM exposes the exports object as the default.
import equalModule from "ajv/dist/runtime/equal.js";
import lengthModule from "ajv/dist/runtime/ucs2length.js";

function asFunction<Helper>(module: Helper | { default: Helper }): Helper {
  return typeof module === "object" && module !== null && "default" in module
    ? module.default
    : (module as Helper);
}

export const equal = asFunction(equalModule);
export const ucs2length = asFunction(lengthModule);
