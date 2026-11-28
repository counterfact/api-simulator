import type {
  FetchOperation,
  FetchSdkDefinition,
  NamedOperation,
  NamedOperations,
} from "@counterfact/client/fetch";
import type {
  ClientOperation,
  ClientOperations,
  ClientResult,
} from "@counterfact/types/client-route";

import {
  ContentType,
  HttpClient,
  resolveHttpClient,
  responseFormatForMediaType,
  responseMediaTypes,
  type ApiConfig,
  type CancelToken,
  type FullRequestParams,
  type HttpProvider,
  type HttpResponse,
  type QueryParamsType,
  type RequestParams,
  type OperationRequestParams,
} from "./http-client.js";

export { ContentType, HttpClient } from "./http-client.js";
export type {
  ApiConfig,
  CancelToken,
  FullRequestParams,
  HttpProvider,
  HttpResponse,
  QueryParamsType,
  RequestParams,
  ResponseFormat,
} from "./http-client.js";

type EmptyFields = Record<never, never>;

type PositionalQuery<Operation extends ClientOperation> =
  Operation["querystring"] extends {
    value: infer Query;
    required: infer Required;
  }
    ? Required extends true
      ? [query: Query]
      : [query?: Query]
    : [keyof Operation["query"]] extends [never]
      ? []
      : EmptyFields extends Operation["query"]
        ? [query?: Operation["query"]]
        : [query: Operation["query"]];

type FormPayload<Body> = Body extends Blob | Uint8Array
  ? File | Blob | Uint8Array
  : Body extends readonly unknown[]
    ? { [Key in keyof Body]: FormPayload<Body[Key]> }
    : Body extends object
      ? { [Key in keyof Body]: FormPayload<Body[Key]> }
      : Body;

type PositionalBody<Operation extends ClientOperation> = Operation extends {
  adapterBody: infer Body;
}
  ? [data: FormPayload<Body>]
  : [Operation["body"]] extends [never]
    ? []
    : [data: Operation["body"]];

type OperationArguments<
  Operation extends ClientOperation,
  Parameters extends readonly string[],
> = [
  ...{
    [Index in keyof Parameters]: Operation["path"][Parameters[Index] &
      keyof Operation["path"]];
  },
  ...(PositionalQuery<Operation> extends [unknown]
    ? [...PositionalQuery<Operation>, ...PositionalBody<Operation>]
    : [...PositionalBody<Operation>, ...PositionalQuery<Operation>]),
  params?: RequestParams,
];

type SuccessStatus = `2${"XX" | `${number}${number}`}`;
type ResultBody<Result> = Result extends {
  body: infer Body;
  mediaType: infer MediaType;
}
  ? MediaType extends `image/${string}`
    ? Blob
    : MediaType extends
          "multipart/form-data" | "application/x-www-form-urlencoded"
      ? FormData
      : Body
  : never;
type BodyOr<Body, Fallback> = [Body] extends [never]
  ? Fallback
  : Body extends undefined
    ? void
    : Body;
type ResponseFor<Data, Error, Unwrap extends boolean> = Unwrap extends true
  ? Data
  : HttpResponse<Data, Error>;

type StaMethod<
  Operations extends ClientOperations,
  Entry extends NamedOperation,
  Unwrap extends boolean,
> = Entry["path"] extends keyof Operations
  ? Entry["method"] extends keyof Operations[Entry["path"]]
    ? StaCall<
        Operations[Entry["path"]][Entry["method"]],
        Entry["pathParameters"],
        Unwrap
      >
    : never
  : never;

type StaCall<
  Operation extends ClientOperation,
  Parameters extends readonly string[],
  Unwrap extends boolean,
> = (
  ...args: OperationArguments<Operation, Parameters>
) => Promise<
  ResponseFor<
    BodyOr<
      ResultBody<
        Extract<ClientResult<Operation>, { matchedStatus: SuccessStatus }>
      >,
      void
    >,
    BodyOr<
      ResultBody<
        Exclude<ClientResult<Operation>, { matchedStatus: SuccessStatus }>
      >,
      unknown
    >,
    Unwrap
  >
>;

type StaGroup<
  Operations extends ClientOperations,
  Entries extends NamedOperations[string],
  Unwrap extends boolean,
> = {
  [Name in keyof Entries]: StaMethod<Operations, Entries[Name], Unwrap>;
};

type StaCalls<
  Operations extends ClientOperations,
  Names extends NamedOperations,
  Unwrap extends boolean,
> = {
  [Group in Exclude<keyof Names, "">]: StaGroup<
    Operations,
    Names[Group],
    Unwrap
  >;
} & ("" extends keyof Names ? StaGroup<Operations, Names[""], Unwrap> : object);

interface StaApi<SecurityData, Unwrap extends boolean> {
  http: HttpProvider<SecurityData>;
  baseUrl: string;
  request<Data = unknown, Error = unknown>(
    params: FullRequestParams,
  ): Promise<ResponseFor<Data, Error, Unwrap>>;
  setSecurityData(data: SecurityData | null): void;
  abortRequest(token: CancelToken): void;
}

interface StaApiConstructor<
  Operations extends ClientOperations,
  Names extends NamedOperations,
  Unwrap extends boolean,
> {
  new <SecurityData = unknown>(
    configOrHttp?: ApiConfig<SecurityData> | HttpProvider<SecurityData>,
  ): StaApi<SecurityData, Unwrap> & StaCalls<Operations, Names, Unwrap>;
}

function contentTypeOf(operation: FetchOperation): ContentType | undefined {
  const type = operation.body?.mediaType;
  return (
    Object.values(ContentType).find((candidate) => candidate === type) ??
    (type?.endsWith("+json") ? ContentType.Json : undefined)
  );
}

function requestFor(
  operation: FetchOperation,
  { path, method, pathParameters }: NamedOperation,
  args: readonly unknown[],
  inferResponseFormat: boolean,
): OperationRequestParams {
  for (const [index, key] of pathParameters.entries()) {
    const value = String(args.at(index));
    path = path.replaceAll(`{${key}}`, () => value);
  }
  const queryFields = operation.parameters.filter(
    ({ location }) => location === "query",
  );
  const hasQuery =
    operation.querystring !== undefined || queryFields.length > 0;
  const queryRequired =
    operation.querystring?.required ??
    queryFields.some(({ required }) => required);
  let index = pathParameters.length;
  let query: QueryParamsType | undefined;
  if (hasQuery && queryRequired)
    query = args.at(index++) as QueryParamsType | undefined;
  const body = operation.body && args.at(index++);
  if (hasQuery && !queryRequired)
    query = args.at(index++) as QueryParamsType | undefined;
  const params = args.at(index) as RequestParams | undefined;
  const secure = operation.security?.some(
    (alternative) => Object.keys(alternative).length > 0,
  );
  const format = inferResponseFormat
    ? undefined
    : responseFormatForMediaType(
        Object.entries(operation.responses).find(([status]) =>
          /^2(?:\d\d|XX)$/u.test(status),
        )?.[1][0],
      );
  return {
    path,
    method: method.toUpperCase(),
    ...(hasQuery && { query }),
    ...(operation.body && { body, type: contentTypeOf(operation) }),
    ...(secure && { secure }),
    ...(format && { format }),
    ...(inferResponseFormat && { [responseMediaTypes]: operation.responses }),
    ...params,
  };
}

/** Adapt the generated factory to the STA Fetch constructor and method signatures. */
export function wrapSta<
  Operations extends ClientOperations,
  Names extends NamedOperations,
  const Unwrap extends boolean = false,
>(
  {
    definition,
  }: { readonly definition: FetchSdkDefinition<Operations, Names> },
  options?: { readonly unwrapResponseData?: Unwrap },
): StaApiConstructor<Operations, Names, Unwrap> {
  const unwrap = options?.unwrapResponseData === true;
  const metadata: Readonly<
    Record<string, Readonly<Record<string, FetchOperation>>>
  > = definition.operations;

  class Api<SecurityData = unknown> {
    public readonly http: HttpProvider<SecurityData>;

    public constructor(
      configOrHttp: ApiConfig<SecurityData> | HttpProvider<SecurityData> = {},
    ) {
      this.http = resolveHttpClient(configOrHttp, definition.baseUrl);

      for (const [group, entries] of Object.entries(definition.names)) {
        const methods = Object.fromEntries(
          Object.entries(entries).map(([name, entry]) => {
            const operation = metadata[entry.path]?.[entry.method];
            if (!operation)
              throw new TypeError(
                `Unknown SDK operation: ${entry.method} ${entry.path}`,
              );
            return [
              name,
              (...args: unknown[]) =>
                this.request(
                  requestFor(
                    operation,
                    entry,
                    args,
                    this.http instanceof HttpClient,
                  ),
                ),
            ];
          }),
        );
        if (group === "") Object.assign(this, methods);
        else
          Object.defineProperty(this, group, {
            value: methods,
            enumerable: true,
            configurable: true,
            writable: true,
          });
      }
    }

    public get baseUrl(): string {
      return this.http.baseUrl;
    }
    public set baseUrl(value: string) {
      this.http.baseUrl = value;
    }

    public setSecurityData = (data: SecurityData | null): void =>
      this.http.setSecurityData(data);
    public abortRequest = (token: CancelToken): void =>
      this.http.abortRequest(token);

    public request = async <Data = unknown, Error = unknown>(
      params: FullRequestParams,
    ) => {
      const response = await this.http.request<Data, Error>(params);
      return unwrap ? response.data : response;
    };
  }

  return Api as unknown as StaApiConstructor<Operations, Names, Unwrap>;
}
