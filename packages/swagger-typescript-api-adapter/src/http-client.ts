export type QueryParamsType = Record<string | number, unknown>;
export type CancelToken = symbol | string | number;
export type ResponseFormat =
  "arrayBuffer" | "blob" | "bytes" | "formData" | "json" | "text";

export enum ContentType {
  Json = "application/json",
  JsonApi = "application/vnd.api+json",
  FormData = "multipart/form-data",
  UrlEncoded = "application/x-www-form-urlencoded",
  Text = "text/plain",
}

export interface FullRequestParams extends Omit<RequestInit, "body"> {
  path: string;
  secure?: boolean;
  type?: ContentType;
  query?: QueryParamsType;
  format?: ResponseFormat;
  body?: unknown;
  baseUrl?: string;
  cancelToken?: CancelToken;
}

export type RequestParams = Omit<
  FullRequestParams,
  "body" | "method" | "query" | "path"
>;

export interface ApiConfig<SecurityData = unknown> {
  baseUrl?: string;
  baseApiParams?: Omit<RequestParams, "baseUrl" | "cancelToken" | "signal">;
  securityWorker?: (
    data: SecurityData | null,
  ) => RequestParams | void | Promise<RequestParams | void>;
  customFetch?: typeof fetch;
}

export interface HttpResponse<Data, Error = unknown> extends Response {
  data: Data;
  error: Error;
}

export interface HttpProvider<SecurityData = unknown> {
  baseUrl: string;
  request<Data = unknown, Error = unknown>(
    params: FullRequestParams,
  ): Promise<HttpResponse<Data, Error>>;
  setSecurityData(data: SecurityData | null): void;
  abortRequest(token: CancelToken): void;
}

function queryString(query: QueryParamsType = {}): string {
  return Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .flatMap(([key, value]) =>
      (Array.isArray(value) ? value : [value]).map(
        (item: unknown) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`,
      ),
    )
    .join("&");
}

function encodeBody(
  body: unknown,
  contentType: ContentType | undefined,
): RequestInit["body"] {
  if (body === undefined || body === null) return null;
  switch (contentType) {
    case ContentType.FormData: {
      if (body instanceof FormData) return body;
      const fields = new FormData();
      for (const [key, value] of Object.entries(
        body as Record<string, unknown>,
      )) {
        fields.append(
          key,
          value instanceof Blob
            ? value
            : typeof value === "object" && value !== null
              ? JSON.stringify(value)
              : String(value),
        );
      }
      return fields;
    }
    case ContentType.UrlEncoded:
      return body instanceof URLSearchParams
        ? body.toString()
        : queryString(body as QueryParamsType);
    case ContentType.Text:
      return typeof body === "string" ? body : JSON.stringify(body);
    default:
      return JSON.stringify(body);
  }
}

interface PendingRequests {
  controller: AbortController;
  count: number;
}

/** Fetch transport for STA-style requests and response handling. */
class StaTransport<
  SecurityData = unknown,
> implements HttpProvider<SecurityData> {
  public baseUrl: string;
  private securityData: SecurityData | null = null;
  private readonly pending = new Map<CancelToken, PendingRequests>();
  private readonly defaults: RequestParams;
  private readonly securityWorker: ApiConfig<SecurityData>["securityWorker"];
  private readonly fetchRequest: typeof fetch;

  public constructor(config: ApiConfig<SecurityData> = {}) {
    this.baseUrl = config.baseUrl ?? "";
    this.defaults = {
      credentials: "same-origin",
      redirect: "follow",
      referrerPolicy: "no-referrer",
      ...config.baseApiParams,
    };
    this.securityWorker = config.securityWorker;
    this.fetchRequest = config.customFetch ?? ((...args) => fetch(...args));
  }

  public setSecurityData = (data: SecurityData | null): void => {
    this.securityData = data;
  };

  public abortRequest = (token: CancelToken): void => {
    this.pending.get(token)?.controller.abort();
    this.pending.delete(token);
  };

  private acquire(token: CancelToken): PendingRequests {
    const entry = this.pending.get(token) ?? {
      controller: new AbortController(),
      count: 0,
    };
    entry.count += 1;
    this.pending.set(token, entry);
    return entry;
  }

  public request = async <Data = unknown, Error = unknown>({
    path,
    method,
    secure,
    type,
    query,
    format,
    body,
    baseUrl,
    cancelToken,
    ...params
  }: FullRequestParams): Promise<HttpResponse<Data, Error>> => {
    const security =
      (secure ?? this.defaults.secure)
        ? await this.securityWorker?.(this.securityData)
        : undefined;
    const headers = new Headers(this.defaults.headers);
    for (const source of [params.headers, security?.headers]) {
      new Headers(source).forEach((value, key) => headers.set(key, value));
    }
    if (type && type !== ContentType.FormData)
      headers.set("Content-Type", type);
    const {
      secure: _secure,
      format: configuredFormat,
      type: _type,
      baseUrl: _baseUrl,
      cancelToken: _cancelToken,
      ...init
    } = {
      ...this.defaults,
      ...params,
      ...security,
    };
    const search = queryString(query);
    const pending =
      cancelToken === undefined ? undefined : this.acquire(cancelToken);
    try {
      const response = await this.fetchRequest(
        `${baseUrl || this.baseUrl}${path}${search ? `?${search}` : ""}`,
        {
          ...init,
          headers,
          method,
          signal: pending?.controller.signal ?? init.signal,
          body: encodeBody(body, type),
        },
      );
      const result = Object.assign(response, {
        data: null as Data,
        error: null as Error,
      });
      const responseFormat = format ?? configuredFormat;
      if (responseFormat) {
        const copy = response.clone();
        try {
          const parsed: unknown =
            responseFormat === "bytes"
              ? new Uint8Array(await copy.arrayBuffer())
              : // eslint-disable-next-line security/detect-object-injection -- the format is a supported Fetch body reader.
                await copy[responseFormat]();
          if (response.ok) result.data = parsed as Data;
          else result.error = parsed as Error;
        } catch (error) {
          result.error = error as Error;
        }
      }
      if (!response.ok) throw result;
      return result;
    } finally {
      if (
        cancelToken !== undefined &&
        pending &&
        this.pending.get(cancelToken) === pending
      ) {
        pending.count -= 1;
        if (pending.count === 0) this.pending.delete(cancelToken);
      }
    }
  };
}

const attachTransport = Symbol("attachTransport");

/** Capture STA Fetch configuration for use with an adapted Api constructor. */
export class HttpClient<
  SecurityData = unknown,
> implements HttpProvider<SecurityData> {
  readonly #config: ApiConfig<SecurityData>;
  #securityData: SecurityData | null = null;
  #transport: StaTransport<SecurityData> | undefined;

  public constructor(config: ApiConfig<SecurityData> = {}) {
    this.#config = { ...config };
  }

  public get baseUrl(): string {
    return this.#transport?.baseUrl ?? this.#config.baseUrl ?? "";
  }

  public set baseUrl(value: string) {
    this.#config.baseUrl = value;
    if (this.#transport) this.#transport.baseUrl = value;
  }

  public setSecurityData = (data: SecurityData | null): void => {
    this.#securityData = data;
    this.#transport?.setSecurityData(data);
  };

  public abortRequest = (token: CancelToken): void => {
    this.#transport?.abortRequest(token);
  };

  public request = <Data = unknown, Error = unknown>(
    params: FullRequestParams,
  ) => {
    // eslint-disable-next-line security/detect-object-injection -- the key is the private module symbol.
    const transport = this[attachTransport]("");
    return transport.request<Data, Error>(params);
  };

  public [attachTransport](baseUrl: string): StaTransport<SecurityData> {
    if (!this.#transport) {
      this.#transport = new StaTransport({
        ...this.#config,
        baseUrl: this.#config.baseUrl ?? baseUrl,
      });
      this.#transport.setSecurityData(this.#securityData);
    }
    return this.#transport;
  }
}

export function resolveHttpClient<SecurityData>(
  configOrHttp: ApiConfig<SecurityData> | HttpProvider<SecurityData>,
  baseUrl: string,
): HttpProvider<SecurityData> {
  const http =
    "request" in configOrHttp ? configOrHttp : new HttpClient(configOrHttp);
  if (http instanceof HttpClient) {
    // eslint-disable-next-line security/detect-object-injection -- the key is the private module symbol.
    http[attachTransport](baseUrl);
  }
  return http;
}
