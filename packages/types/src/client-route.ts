/** One client-facing OpenAPI operation. Keys in the input maps retain their requiredness. */
export interface ClientOperation {
  path: object;
  query: object;
  headers: object;
  cookies: object;
  body: unknown;
  bodyRequired: boolean;
  responses: Record<string, { mediaType: string | undefined; body: unknown }>;
}

export type ClientOperations = Record<string, Record<string, ClientOperation>>;

type RoutePath<Operations> = Extract<keyof Operations, string>;

type Prefixes<Path extends string> =
  Path extends `${infer Segment}/${infer Tail}`
    ? Segment | `${Segment}/${Prefixes<Tail>}`
    : Path;

export type ClientPath<Operations> =
  "/" | Exclude<Prefixes<RoutePath<Operations>>, "">;

type Append<Path extends string, Fragment extends string> = Path extends "/"
  ? `/${Fragment}`
  : `${Path}/${Fragment}`;

type Fragments<Routes extends string, Path extends string> = Path extends "/"
  ? Routes extends `/${infer Tail}`
    ? Exclude<Tail, "">
    : never
  : Routes extends `${Path}/${infer Tail}`
    ? Tail
    : never;

type PathNames<Path extends string> =
  Path extends `${string}{${infer Name}}${infer Tail}`
    ? Name | PathNames<Tail>
    : never;

type OperationsAt<
  Operations,
  Path extends PropertyKey,
> = Path extends keyof Operations ? Operations[Path] : never;

type DescendantRoutes<Operations, Path extends string> = Path extends "/"
  ? RoutePath<Operations>
  : Extract<RoutePath<Operations>, Path | `${Path}/${string}`>;

type PathValues<
  Operations,
  Path extends string,
  Name extends string,
  Route extends RoutePath<Operations> = DescendantRoutes<Operations, Path>,
> =
  Route extends RoutePath<Operations>
    ? {
        [Method in keyof Operations[Route]]: Operations[Route][Method] extends {
          path: Record<Name, infer Value>;
        }
          ? Value
          : never;
      }[keyof Operations[Route]]
    : never;

type PrefixValues<Operations, Path extends string> = {
  [Name in PathNames<Path>]: PathValues<Operations, Path, Name>;
};

type Merge<Previous, Next> = Omit<Previous, keyof Next> & Next;

type WithInput<
  Name extends PropertyKey,
  Input,
  Result,
> = keyof Input extends never ? unknown : { [Key in Name]: Result };

type ParameterValues<Values, Supplied> = Partial<Values> &
  Record<Exclude<keyof Supplied, keyof Values>, never>;

type InputSetter<
  Kind extends InputKind,
  Operation extends ClientOperation,
  State extends RequestState,
> = WithInput<
  Kind,
  Operation[Kind],
  <const Values extends Partial<Operation[Kind]>>(
    values: ParameterValues<Operation[Kind], Values> & Values,
  ) => ClientRequest<
    Operation,
    {
      [Key in InputKind]: Key extends Kind
        ? Merge<State[Key], Values>
        : State[Key];
    } & Pick<State, "hasBody">
  >
>;

type InputKind = "path" | "query" | "headers" | "cookies";
type RequestState = Record<InputKind, object> & { hasBody: boolean };
type EmptyFields = Record<never, never>;
type InitialState<Path> = {
  path: Path;
  query: EmptyFields;
  headers: EmptyFields;
  cookies: EmptyFields;
  hasBody: false;
};

interface UndocumentedResponse {
  matchedStatus: undefined;
  status: number;
  mediaType: string | undefined;
  body: unknown;
  response: Response;
}

type StatusNumber<Status> = Status extends `${infer Code extends number}`
  ? Code
  : number;

type DeclaredResponse<Status, Content> = Content extends {
  mediaType: string | undefined;
  body: unknown;
}
  ? Content & {
      matchedStatus: Status;
      status: StatusNumber<Status>;
      response: Response;
    }
  : never;

export type ClientResult<Operation extends ClientOperation> =
  | {
      [Status in keyof Operation["responses"]]: DeclaredResponse<
        Status,
        Operation["responses"][Status]
      >;
    }[keyof Operation["responses"]]
  | UndocumentedResponse;

export type ClientSendOptions = Pick<RequestInit, "signal">;

type CanSend<
  Operation extends ClientOperation,
  State extends RequestState,
> = State extends Pick<Operation, InputKind> & {
  hasBody: Operation["bodyRequired"] extends true ? true : boolean;
}
  ? { send(options?: ClientSendOptions): Promise<ClientResult<Operation>> }
  : unknown;

type Defined = NonNullable<unknown> | null;

export type ClientRequest<
  Operation extends ClientOperation,
  State extends RequestState,
> = InputSetter<"path", Operation, State> &
  InputSetter<"query", Operation, State> &
  InputSetter<"headers", Operation, State> &
  InputSetter<"cookies", Operation, State> &
  ([Operation["body"] & Defined] extends [never]
    ? unknown
    : {
        body(
          value: Operation["body"] & Defined,
        ): ClientRequest<Operation, Omit<State, "hasBody"> & { hasBody: true }>;
      }) &
  CanSend<Operation, State>;

export type ClientRoute<
  Operations extends ClientOperations,
  Path extends ClientPath<Operations>,
  Bound extends object = EmptyFields,
> = WithInput<
  "path",
  PrefixValues<Operations, Path>,
  <const Values extends Partial<PrefixValues<Operations, Path>>>(
    values: ParameterValues<PrefixValues<Operations, Path>, Values> & Values,
  ) => ClientRoute<Operations, Path, Merge<Bound, Values>>
> &
  ([Fragments<ClientPath<Operations>, Path>] extends [never]
    ? unknown
    : {
        segment<Fragment extends Fragments<ClientPath<Operations>, Path>>(
          fragment: Fragment,
        ): ClientRoute<
          Operations,
          Extract<Append<Path, Fragment>, ClientPath<Operations>>,
          Bound
        >;
      }) &
  ([OperationsAt<Operations, Path>] extends [never]
    ? unknown
    : {
        method<
          Method extends Extract<keyof OperationsAt<Operations, Path>, string>,
        >(
          method: Method,
        ): ClientRequest<
          Extract<OperationsAt<Operations, Path>[Method], ClientOperation>,
          InitialState<Bound>
        >;
      });

export type ClientRouteFunction<Operations extends ClientOperations> = <
  Path extends ClientPath<Operations>,
>(
  path: Path,
) => ClientRoute<Operations, Path>;
