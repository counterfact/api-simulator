/** Runtime configuration for a Counterfact server instance. */
export interface Config {
  /** Optional bearer token that protects the Admin API endpoints. */
  adminApiToken?: string;
  /** When `true`, JSON Schema Faker generates values for all optional fields. */
  alwaysFakeOptionals: boolean;
  /** Absolute path to the directory that contains generated route files. */
  basePath: string;
  /** When `true`, transpile TypeScript route files to a `.cache/` directory. */
  buildCache: boolean;
  /** Controls which artefacts are (re-)generated from the OpenAPI spec. */
  generate: {
    /** Remove route files that no longer correspond to a spec path. */
    prune?: boolean;
    /** Generate route handler stubs. */
    routes: boolean;
    /** Generate TypeScript type files. */
    types: boolean;
  };
  /** Path or URL to the OpenAPI document. Use `"_"` to skip spec loading. */
  openApiPath: string;
  /**
   * Optional ordered list of overlay file paths/URLs to apply to the OpenAPI
   * document after loading.  Overlays are applied in the order listed.
   */
  overlays?: readonly string[];
  /** TCP port the HTTP server listens on. */
  port: number;
  /**
   * Per-path proxy toggle map.  `true` means requests to that path are
   * forwarded to `proxyUrl`; `false` means they are handled locally.
   */
  proxyPaths: Map<string, boolean>;
  /** Base URL of the upstream server used when proxying is enabled. */
  proxyUrl: string;
  /** URL prefix that Counterfact intercepts (default `""`). */
  prefix: string;
  /** When `true`, mount the Admin API at `/_counterfact/api/`. Defaults to `false`. */
  startAdminApi?: boolean;
  /** When `true`, launch the interactive REPL after the server starts. */
  startRepl: boolean;
  /** When `true`, start the Koa HTTP server. */
  startServer: boolean;
  /** When `true`, validate incoming requests against the OpenAPI spec. */
  validateRequests: boolean;
  /** When `true`, validate outgoing responses against the OpenAPI spec. */
  validateResponses: boolean;
  /** Controls which artefacts are watched for live reload. */
  watch: {
    /** Re-generate route stubs when the OpenAPI spec changes. */
    routes: boolean;
    /** Re-generate type files when the OpenAPI spec changes. */
    types: boolean;
  };
}
