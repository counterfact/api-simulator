import type {
  ClientSendOptions,
  ClientSecurityScheme,
} from "@counterfact/types/client-route";

export interface CookieCredential {
  credentials: "include" | "same-origin";
}

type Credential = string | CookieCredential;

export type CredentialProvider<Value extends Credential = Credential> =
  (context: {
    scopes: readonly string[];
    signal: AbortSignal | undefined;
  }) => Value | undefined | Promise<Value | undefined>;

export type SecurityRequirement = Readonly<Record<string, readonly string[]>>;

type SecuritySchemes = Readonly<Record<string, ClientSecurityScheme>>;
type Providers = Readonly<Record<string, CredentialProvider | undefined>>;

export class RequestAuthenticationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RequestAuthenticationError";
  }
}

function own<Value>(
  record: Readonly<Record<string, Value>>,
  key: string,
): Value | undefined {
  // eslint-disable-next-line security/detect-object-injection -- only own entries may name schemes and providers.
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function applyQueryCredentials(
  url: URL,
  remove: ReadonlySet<string>,
  add = new URLSearchParams(),
): void {
  const current = url.search.slice(1).split("&").filter(Boolean);
  const kept = current.filter((part) =>
    [...new URLSearchParams(part).keys()].every((key) => !remove.has(key)),
  );
  if (kept.length !== current.length || add.size > 0) {
    // Keep the encoding of unrelated OpenAPI parameters, including array separators.
    url.search = [...kept, add.toString()].filter(Boolean).join("&");
  }
}

function clearCredentials(
  url: URL,
  headers: Headers,
  schemes: SecuritySchemes,
): void {
  headers.delete("authorization");
  headers.delete("cookie");
  const queryNames = new Set<string>();
  for (const scheme of Object.values(schemes)) {
    if (scheme.type !== "apiKey") continue;
    if (scheme.location === "header") headers.delete(scheme.name);
    if (scheme.location === "query") queryNames.add(scheme.name);
  }
  if (queryNames.size > 0) applyQueryCredentials(url, queryNames);
}

async function resolveAlternative(
  requirement: SecurityRequirement,
  schemes: SecuritySchemes,
  providers: Providers,
  signal: AbortSignal | undefined,
  credentials: RequestInit["credentials"],
) {
  const entries: {
    name: string;
    scopes: readonly string[];
    scheme: ClientSecurityScheme;
    provider: CredentialProvider;
  }[] = [];
  for (const [name, scopes] of Object.entries(requirement)) {
    const scheme = own(schemes, name);
    const provider = own(providers, name);
    if (
      !scheme ||
      !provider ||
      (scheme.type === "apiKey" &&
        scheme.location === "cookie" &&
        credentials === "omit")
    )
      return undefined;
    entries.push({ name, scopes, scheme, provider });
  }

  const headers = new Map<string, string>();
  const query = new Map<string, string>();
  let cookieCredentials: CookieCredential["credentials"] | undefined;
  for (const { name, scopes, scheme, provider } of entries) {
    signal?.throwIfAborted();
    const value = await provider({ scopes, signal });
    signal?.throwIfAborted();
    if (value === undefined || value === "") return undefined;
    if (scheme.type === "apiKey" && scheme.location === "cookie") {
      if (
        typeof value === "string" ||
        !["include", "same-origin"].includes(value.credentials)
      ) {
        throw new RequestAuthenticationError(
          `Invalid cookie credentials for security scheme "${name}"`,
        );
      }
      if (
        cookieCredentials !== undefined &&
        cookieCredentials !== value.credentials
      ) {
        throw new RequestAuthenticationError(
          `Conflicting cookie settings for security scheme "${name}"`,
        );
      }
      cookieCredentials = value.credentials;
      continue;
    }
    if (typeof value !== "string") {
      throw new RequestAuthenticationError(
        `Expected a credential string for security scheme "${name}"`,
      );
    }
    const target =
      scheme.type === "apiKey" && scheme.location === "query" ? query : headers;
    const key =
      scheme.type === "bearer"
        ? "authorization"
        : target === headers
          ? scheme.name.toLowerCase()
          : scheme.name;
    const credential = scheme.type === "bearer" ? `Bearer ${value}` : value;
    if (target.has(key) && target.get(key) !== credential) {
      throw new RequestAuthenticationError(
        `Conflicting credentials for security scheme "${name}"`,
      );
    }
    target.set(key, credential);
  }
  return { headers, query, cookieCredentials };
}

export async function applyAuthentication(
  url: URL,
  init: RequestInit & { headers: Headers },
  security: readonly SecurityRequirement[],
  schemes: SecuritySchemes,
  providers: Providers,
  options: ClientSendOptions | undefined,
): Promise<void> {
  const anonymous =
    security.length === 0 ||
    security.some((entry) => Object.keys(entry).length === 0);
  if (options?.authenticate === false) {
    if (!anonymous)
      throw new RequestAuthenticationError(
        "This operation requires authentication",
      );
    clearCredentials(url, init.headers, schemes);
    init.credentials = "omit";
    return;
  }

  for (const requirement of security) {
    if (Object.keys(requirement).length === 0) continue;
    const resolved = await resolveAlternative(
      requirement,
      schemes,
      providers,
      options?.signal ?? undefined,
      init.credentials,
    );
    if (!resolved) continue;
    for (const [key, value] of resolved.headers) init.headers.set(key, value);
    if (resolved.query.size > 0) {
      applyQueryCredentials(
        url,
        new Set(resolved.query.keys()),
        new URLSearchParams([...resolved.query]),
      );
    }
    init.credentials ??= resolved.cookieCredentials;
    init.redirect ??= "error";
    return;
  }
  if (options?.authenticate === true || !anonymous) {
    throw new RequestAuthenticationError(
      "No credentials available for this operation",
    );
  }
  if (security.length > 0) {
    clearCredentials(url, init.headers, schemes);
    init.credentials = "omit";
  }
}
