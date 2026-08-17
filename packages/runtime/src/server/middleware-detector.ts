import type { Context } from "./context-registry.js";
import type { MiddlewareFunction, Module } from "./registry.js";

export interface ContextModule {
  Context?: Context;
}

export function isContextModule(
  module: ContextModule | Module,
): module is ContextModule {
  return "Context" in module && typeof module.Context === "function";
}

export function isMiddlewareModule(
  module: ContextModule | Module,
): module is ContextModule & { middleware: MiddlewareFunction } {
  return (
    "middleware" in module &&
    typeof Object.getOwnPropertyDescriptor(module, "middleware")?.value ===
      "function"
  );
}
