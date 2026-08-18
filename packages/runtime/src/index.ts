export { ContextRegistry, type Context } from "./server/context-registry.js";
export {
  type ChaosApplyResult,
  ChaosRegistry,
  ChaosRule,
} from "./server/chaos.js";
export {
  Dispatcher,
  type DispatcherRequest,
  type OpenApiDocument as DispatcherOpenApiDocument,
} from "./server/dispatcher.js";
export { loadOpenApiDocument } from "./server/load-openapi-document.js";
export { ModuleLoader } from "./server/module-loader.js";
export { OpenApiDocument } from "./server/openapi-document.js";
export {
  Registry,
  type HttpMethods,
  type MiddlewareFunction,
  type Module,
  type RequestMethod,
} from "./server/registry.js";
export { ScenarioRegistry } from "./server/scenario-registry.js";
export { StoreLoader } from "./server/store-loader.js";
export { Transpiler } from "./server/transpiler.js";
export { runtimeCanExecuteErasableTs } from "./runtime-can-execute-erasable-ts.js";
export type {
  AdminApiAdapter,
  DispatcherConfig,
  KoaRuntimeConfig,
  ProxyConfig,
  RuntimeEventReporter,
} from "./runtime-config.js";

/** Minimal context lookup used by higher-level integrations such as the REPL. */
export interface ContextLookup {
  find(path: string): Record<string, unknown>;
}

/** Minimal route catalog used by higher-level integrations. */
export interface RouteListing {
  readonly routes: Array<{
    methods: { [key: string]: string };
    path: string;
  }>;
}

/** Minimal scenario catalog used by higher-level integrations. */
export interface ScenarioCatalog {
  getExportedFunctionNames(fileKey: string): string[];
  getFileKeys(): string[];
  getModule(fileKey: string): Record<string, unknown> | undefined;
}
