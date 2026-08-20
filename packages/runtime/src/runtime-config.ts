/** Reports an observable runtime event without coupling the runtime to telemetry. */
export type RuntimeEventReporter = (
  event: string,
  properties?: Record<string, unknown>,
) => void;

/** Request/response behavior consumed by the dispatcher. */
export interface DispatcherConfig {
  alwaysFakeOptionals: boolean;
  validateRequests: boolean;
  validateResponses: boolean;
}

/** Proxy behavior consumed by the HTTP route middleware. */
export interface ProxyConfig {
  proxyPaths: Map<string, boolean>;
  proxyUrl: string;
}

/** Facade-owned product information exposed through the optional Admin API. */
export interface AdminApiAdapter extends ProxyConfig {
  adminApiToken?: string;
  basePath: string;
  port: number;
  prefix: string;
  getConfigSnapshot(): Record<string, unknown>;
  setProxyUrl(proxyUrl: string): void;
}

/** HTTP-layer configuration accepted by {@link createKoaApp}. */
export interface KoaRuntimeConfig extends ProxyConfig {
  basePath: string;
  port: number;
  startAdminApi?: boolean;
}
