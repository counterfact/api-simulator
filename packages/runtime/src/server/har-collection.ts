import { once } from "node:events";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { watch, type FSWatcher } from "chokidar";
import type {
  COUNTERFACT_RESPONSE,
  HarEntry,
  HarLookup,
  HarMatch,
  HarRequest,
} from "@counterfact/types";
import { CHOKIDAR_OPTIONS } from "./constants.js";

const DROP_HEADERS = new Set([
  "content-length",
  "content-encoding",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "trailers",
]);

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected an object");
  }
  return value as ObjectValue;
}
function fields(value: unknown): Record<string, string[]> {
  const result: Record<string, string[]> = Object.create(null);
  if (!Array.isArray(value)) throw new Error("expected a name/value array");
  for (const item of value) {
    const pair = object(item);
    if (typeof pair.name !== "string" || typeof pair.value !== "string") {
      throw new Error("expected string name/value fields");
    }
    (result[pair.name.toLowerCase()] ??= []).push(pair.value);
  }
  return result;
}
function queryFields(params: URLSearchParams): Record<string, string[]> {
  const result: Record<string, string[]> = Object.create(null);
  for (const [name, value] of params) (result[name] ??= []).push(value);
  return result;
}
function mediaType(headers: HarRequest["headers"]): string {
  return (
    headers["content-type"]?.[0]?.split(";")[0]?.trim().toLowerCase() ?? ""
  );
}
function jsonType(type: string): boolean {
  return type === "application/json" || type.endsWith("+json");
}

/** Normalize transport data without coercing query values through OpenAPI. */
export function createHarRequest(input: {
  method: string;
  url: string;
  headers: Record<string, unknown>;
  body?: unknown;
  rawBody?: string | Uint8Array;
}): HarRequest {
  const url = new URL(input.url, "http://counterfact.invalid");
  const headers: Record<string, string[]> = Object.create(null);
  for (const [name, value] of Object.entries(input.headers)) {
    if (value !== undefined)
      headers[name.toLowerCase()] = Array.isArray(value)
        ? value.map(String)
        : [String(value)];
  }
  return structuredClone({
    method: input.method.toUpperCase(),
    pathname: url.pathname,
    query: queryFields(url.searchParams),
    headers,
    body: input.body,
    // Binary wire bodies are preserved by the adapter, but HAR text matching
    // cannot compare them without inventing a text encoding.
    rawBody: typeof input.rawBody === "string" ? input.rawBody : undefined,
    bodyAvailable:
      input.rawBody === undefined || typeof input.rawBody === "string",
  });
}

function bodyKey(request: HarRequest): unknown {
  if (!request.bodyAvailable) return Symbol("unavailable");
  const type = mediaType(request.headers);
  if (type.startsWith("multipart/")) return Symbol("multipart");
  const raw = request.rawBody;
  if (jsonType(type)) {
    if (raw !== undefined) {
      try {
        return { json: JSON.parse(raw) as unknown };
      } catch {
        return Symbol("invalid JSON");
      }
    }
    if (request.body !== undefined) return { json: request.body };
  }
  if (type === "application/x-www-form-urlencoded") {
    if (raw !== undefined)
      return { form: { ...queryFields(new URLSearchParams(raw)) } };
    if (request.body !== undefined) {
      const body = object(request.body);
      return {
        form: Object.fromEntries(
          Object.entries(body).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.map(String) : [String(value)],
          ]),
        ),
      };
    }
  }
  return raw !== undefined
    ? { text: raw }
    : request.body === undefined
      ? { absent: true }
      : { text: request.body };
}

function createMatch(request: HarRequest, recorded: HarRequest): HarMatch {
  return ((key: keyof HarRequest | "header", name?: string): boolean => {
    if (key === "header") {
      if (name === undefined)
        throw new TypeError('HAR match("header", name) requires a header name');
      return isDeepStrictEqual(
        request.headers[name.toLowerCase()],
        recorded.headers[name.toLowerCase()],
      );
    }
    if (key === "query") {
      return name === undefined
        ? isDeepStrictEqual({ ...request.query }, { ...recorded.query })
        : isDeepStrictEqual(request.query[name], recorded.query[name]);
    }
    if (name !== undefined)
      throw new TypeError(
        "A HAR field name is only supported for header or query matching",
      );
    if (key === "body")
      return isDeepStrictEqual(bodyKey(request), bodyKey(recorded));
    if (key === "headers")
      return isDeepStrictEqual({ ...request.headers }, { ...recorded.headers });
    if (
      key === "method" ||
      key === "pathname" ||
      key === "rawBody" ||
      key === "bodyAvailable"
    )
      return request[key] === recorded[key];
    throw new TypeError("Unknown HAR request matching key");
  }) as HarMatch;
}

function matches(match: HarMatch): boolean {
  return (
    match("method") && match("pathname") && match("query") && match("body")
  );
}

function parseEntry(
  value: unknown,
  filename: string,
  entryIndex: number,
): HarEntry {
  const entry = object(value);
  const request = object(entry.request);
  const response = object(entry.response);
  if (typeof request.method !== "string" || typeof request.url !== "string")
    throw new Error("missing request method or URL");
  const headers = fields(request.headers ?? []);
  const postData =
    request.postData === undefined ? undefined : object(request.postData);
  if (typeof postData?.mimeType === "string" && !headers["content-type"])
    headers["content-type"] = [postData.mimeType];
  let rawBody = typeof postData?.text === "string" ? postData.text : undefined;
  if (
    rawBody === undefined &&
    mediaType(headers) === "application/x-www-form-urlencoded" &&
    Array.isArray(postData?.params)
  ) {
    const params = new URLSearchParams();
    for (const item of postData.params) {
      const pair = object(item);
      if (
        typeof pair.name !== "string" ||
        typeof pair.value !== "string" ||
        pair.fileName !== undefined
      )
        throw new Error("unsupported form request parameters");
      params.append(pair.name, pair.value);
    }
    rawBody = params.toString();
  }
  const normalized = createHarRequest({
    method: request.method,
    url: new URL(request.url).href,
    headers,
    rawBody,
  });
  let body: unknown = rawBody;
  if (rawBody !== undefined && jsonType(mediaType(headers))) {
    try {
      body = JSON.parse(rawBody) as unknown;
    } catch {
      /* Retain the text for custom predicates. */
    }
  }
  const content = object(response.content ?? {});
  const status = response.status;
  if (
    typeof status !== "number" ||
    !Number.isInteger(status) ||
    status < 200 ||
    status > 599
  )
    throw new Error("no replayable HTTP status");
  if (content.encoding !== undefined && content.encoding !== "base64")
    throw new Error("unsupported response encoding");
  const noBody =
    normalized.method === "HEAD" ||
    status === 204 ||
    status === 205 ||
    status === 304;
  let responseBody: string | Uint8Array | undefined;
  if (!noBody) {
    if (typeof content.text !== "string") {
      if (content.size !== 0 || content._file !== undefined)
        throw new Error(
          "response content unavailable (external attachments are unsupported)",
        );
      responseBody = "";
    } else if (content.encoding === "base64") {
      const decoded = Buffer.from(content.text, "base64");
      if (decoded.toString("base64") !== content.text.replaceAll(/\s/gu, ""))
        throw new Error("invalid base64 response content");
      responseBody = new Uint8Array(decoded);
    } else responseBody = content.text;
  }
  const responseHeaders = fields(response.headers ?? []);
  return {
    filename,
    entryIndex,
    request: {
      ...normalized,
      body,
      bodyAvailable:
        postData === undefined
          ? !(typeof request.bodySize === "number" && request.bodySize > 0)
          : rawBody !== undefined,
    },
    response: {
      status,
      headers: responseHeaders,
      contentType:
        responseHeaders["content-type"]?.[0] ??
        (typeof content.mimeType === "string"
          ? content.mimeType
          : "application/octet-stream"),
      body: responseBody,
    },
  };
}

/** An instance-owned, atomically replaceable collection of recorded exchanges. */
export class HarCollection {
  private entries: HarEntry[] = [];
  private watcher?: FSWatcher;
  private queue: Promise<void> = Promise.resolve();
  private loadQueue: Promise<void> = Promise.resolve();
  private readonly directory: string;

  public constructor(
    private readonly projectDirectory: string,
    private readonly report: (message: string) => void = (message) =>
      process.stderr.write(`${message}\n`),
  ) {
    this.directory = path.resolve(projectDirectory, "har");
  }

  public lookup(request: HarRequest): HarLookup {
    const snapshot = structuredClone(request);
    return (predicate) => {
      for (const entry of this.entries) {
        const match = createMatch(snapshot, entry.request);
        const defaultMatch = matches(match);
        const selected: unknown = predicate
          ? predicate({
              request: structuredClone(snapshot),
              entry: structuredClone(entry),
              match,
              defaultMatch,
            })
          : defaultMatch;
        if (typeof selected !== "boolean") {
          // Handle rejected async predicates too, without leaving an unhandled rejection.
          void Promise.resolve(selected).catch(() => undefined);
          throw new TypeError(
            "$.har() predicates must synchronously return a boolean",
          );
        }
        if (!selected) continue;
        const dropped = new Set([
          ...DROP_HEADERS,
          ...(entry.response.headers.connection ?? []).flatMap((value) =>
            value.split(",").map((name) => name.trim().toLowerCase()),
          ),
        ]);
        const headers = Object.fromEntries(
          Object.entries(entry.response.headers)
            .filter(([name]) => !dropped.has(name))
            .map(([name, values]) => [name, [...values]]),
        );
        return {
          status: entry.response.status,
          contentType: entry.response.contentType,
          headers,
          body:
            typeof entry.response.body === "string"
              ? entry.response.body
              : entry.response.body === undefined
                ? undefined
                : Buffer.from(entry.response.body),
        } as unknown as COUNTERFACT_RESPONSE;
      }
      return undefined;
    };
  }

  public load(): Promise<void> {
    const operation = this.loadQueue.then(() => this.loadCandidate());
    this.loadQueue = operation.catch(() => undefined);
    return operation;
  }

  private async loadCandidate(): Promise<void> {
    const files = await this.files(this.directory);
    const entries: HarEntry[] = [];
    const diagnostics: string[] = [];
    for (const filename of files.sort()) {
      let document: ObjectValue;
      try {
        const text = await readFile(filename, "utf8");
        document = object(JSON.parse(text.replace(/^\uFEFF/u, "")));
      } catch {
        throw new Error(
          `Could not load HAR "${filename}": unreadable or invalid JSON`,
        );
      }
      const log = document.log;
      if (
        !log ||
        typeof log !== "object" ||
        !Array.isArray((log as ObjectValue).entries)
      )
        throw new Error(
          `Could not load HAR "${filename}": missing log.entries array`,
        );
      const exchanges = (log as ObjectValue).entries as unknown[];
      const relative = path
        .relative(this.directory, filename)
        .split(path.sep)
        .join("/");
      for (const [index, entry] of exchanges.entries()) {
        try {
          entries.push(parseEntry(entry, relative, index));
        } catch (error) {
          diagnostics.push(
            `HAR "${relative}" entry ${index}: skipped (${error instanceof Error ? error.message : "invalid exchange"})`,
          );
        }
      }
    }
    this.entries = entries;
    for (const message of diagnostics) this.report(message);
  }

  private async files(directory: string): Promise<string[]> {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      const results = await Promise.all(
        entries.map((entry) => {
          const filename = path.join(directory, entry.name);
          return entry.isDirectory()
            ? this.files(filename)
            : Promise.resolve(
                entry.isFile() && entry.name.endsWith(".har") ? [filename] : [],
              );
        }),
      );
      return results.flat();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new Error(`Could not read HAR directory "${directory}"`, {
        cause: error,
      });
    }
  }

  public async watch(): Promise<void> {
    if (this.watcher) return;
    const project = path.resolve(this.projectDirectory);
    this.watcher = watch(project, {
      ...CHOKIDAR_OPTIONS,
      followSymlinks: false,
      awaitWriteFinish: { pollInterval: 10, stabilityThreshold: 50 },
      ignored: (filename) => {
        const candidate = path.resolve(filename);
        return (
          candidate !== project &&
          candidate !== this.directory &&
          !candidate.startsWith(`${this.directory}${path.sep}`)
        );
      },
    }).on("all", (_event, filename) => {
      if (
        filename.endsWith(".har") ||
        path.resolve(filename) === this.directory
      )
        this.enqueue();
    });
    this.watcher.on("error", () => {
      this.report(
        `HAR watcher failed in "${this.directory}"; retaining the last good collection.`,
      );
    });
    await once(this.watcher, "ready");
    this.enqueue();
    await this.queue;
  }

  private enqueue(): void {
    this.queue = this.queue
      .then(() => this.load())
      .catch(() => {
        this.report(
          `HAR reload failed in "${this.directory}"; retaining the last good collection. Check that recordings contain valid JSON and log.entries.`,
        );
      });
  }

  public async stopWatching(): Promise<void> {
    const watcher = this.watcher;
    this.watcher = undefined;
    await watcher?.close();
    await this.queue;
    await this.loadQueue;
  }
}
