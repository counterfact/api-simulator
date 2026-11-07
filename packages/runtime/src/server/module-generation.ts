import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire, registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const requireModule = createRequire(import.meta.url);
type CommonJSRecord = {
  module: NodeModule;
  sourceHash?: string;
  dependencies: Set<CommonJSRecord>;
};

const GENERATION = "counterfactGeneration";
let hooksRegistered = false;

type ModuleRecord = {
  url: string;
  hasDynamicImport?: boolean;
  evaluated?: boolean;
  failed?: boolean;
  sourceHash?: string;
  dependencies: Set<ModuleRecord>;
};
type GenerationState = {
  records: Map<string, ModuleRecord>;
  reusable: Map<string, ModuleRecord>;
  failed: boolean;
};
// Node retains evaluated ESM generations. Keep their resolution metadata too:
// a delayed dynamic import must still use the graph belonging to its caller.
const generations = new Map<string, GenerationState>();

// Node load hooks may decode away a UTF-8 BOM; filesystem reads retain it.
// Compare the same source representation so unchanged modules keep identity.
function hashModuleSource(source: string): string {
  return createHash("sha256")
    .update(source.replace(/^\uFEFF/, ""))
    .digest("hex");
}

function canonicalURL(url: string): string {
  const result = new URL(url);
  result.searchParams.delete(GENERATION);
  return result.href;
}

function recordFor(
  state: GenerationState,
  url: string,
  id: string,
): ModuleRecord {
  const key = canonicalURL(url);
  const existing = state.records.get(key) ?? state.reusable.get(key);
  if (existing !== undefined) {
    state.records.set(key, existing);
    return existing;
  }
  const versioned = new URL(url);
  versioned.searchParams.set(GENERATION, id);
  const record: ModuleRecord = { url: versioned.href, dependencies: new Set() };
  state.records.set(key, record);
  return record;
}

function registerGenerationHook(): void {
  if (hooksRegistered) return;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const parent = context.parentURL?.startsWith("file:")
        ? new URL(context.parentURL)
        : undefined;
      const id = parent?.searchParams.get(GENERATION);
      const state = id ? generations.get(id) : undefined;
      let resolved;
      try {
        resolved = nextResolve(specifier, context);
      } catch (error) {
        const record = parent && state?.records.get(canonicalURL(parent.href));
        if (record !== undefined) record.failed = true;
        throw error;
      }
      if (
        !id ||
        state === undefined ||
        !resolved.url.startsWith("file:") ||
        resolved.format === "commonjs" ||
        !(
          specifier.startsWith(".") ||
          specifier.startsWith("/") ||
          specifier.startsWith("file:") ||
          specifier.startsWith("#")
        )
      )
        return resolved;
      const url = new URL(resolved.url);
      if (url.pathname.includes("/node_modules/")) return resolved;
      const dependency = recordFor(state, resolved.url, id);
      state.records
        .get(canonicalURL(context.parentURL!))
        ?.dependencies.add(dependency);
      return { ...resolved, url: dependency.url };
    },
    load(url, context, nextLoad) {
      const id = url.startsWith("file:")
        ? new URL(url).searchParams.get(GENERATION)
        : null;
      const state = id ? generations.get(id) : undefined;
      try {
        const result = nextLoad(url, context);
        const record = state?.records.get(canonicalURL(url));
        if (record !== undefined && result.source != null) {
          const source =
            typeof result.source === "string"
              ? result.source
              : new TextDecoder().decode(result.source);
          // Parse syntax rather than matching comment-separated tokens with a
          // backtracking regex. Future lazy dependencies cannot be proven stable.
          const syntax = ts.createSourceFile(
            "module.ts",
            source,
            ts.ScriptTarget.Latest,
            false,
            ts.ScriptKind.TS,
          );
          const hasDynamicImport = (node: ts.Node): boolean =>
            (ts.isCallExpression(node) &&
              node.expression.kind === ts.SyntaxKind.ImportKeyword) ||
            ts.forEachChild(node, hasDynamicImport) === true;
          record.hasDynamicImport = hasDynamicImport(syntax);
          record.sourceHash = hashModuleSource(source);
        }
        return result;
      } catch (error) {
        const record = state?.records.get(canonicalURL(url));
        if (record !== undefined) record.failed = true;
        throw error;
      }
    },
  });
  hooksRegistered = true;
}

/** A coherent ESM graph, with optional unchanged-subgraph reuse for watchers. */
export class ModuleGeneration {
  private readonly commonJS = new Map<string, CommonJSRecord>();
  private readonly evictions = new Map<string, CommonJSRecord>();
  private watcherGeneration = false;
  private readonly id = randomUUID();
  private readonly state: GenerationState = {
    records: new Map(),
    reusable: new Map(),
    failed: false,
  };

  public constructor() {
    generations.set(this.id, this.state);
  }

  /** A failed evaluation or context construction must never be reused. */
  public markFailed(pathName?: string): void {
    if (pathName === undefined) {
      this.state.failed = true;
      return;
    }
    const url = pathToFileURL(pathName).href;
    const record = this.state.records.get(url);
    if (record !== undefined) record.failed = true;
    const commonJS = [...this.commonJS.values()].find(
      (entry) => pathToFileURL(entry.module.filename).href === url,
    );
    if (commonJS !== undefined) commonJS.sourceHash = undefined;
  }

  /** Reuse only modules whose evaluated source and full dependency graph match. */
  public async refresh(): Promise<ModuleGeneration> {
    const next = new ModuleGeneration();
    next.watcherGeneration = true;
    // Capture children added by delayed require() calls since the last import.
    for (const record of this.commonJS.values()) {
      for (const child of record.module.children) {
        if (child.filename.includes("/node_modules/")) continue;
        let known = this.commonJS.get(child.filename);
        if (known === undefined) {
          // Unknown evaluation-time source: invalidate this late dependency too.
          known = { module: child, dependencies: new Set() };
          this.commonJS.set(child.filename, known);
        }
        record.dependencies.add(known);
      }
    }
    // Retain older dependency records too: explicitly reloading a child can
    // replace its map entry while an already evaluated parent still holds it.
    const commonJSRecords = new Set<CommonJSRecord>();
    const visitCommonJS = (record: CommonJSRecord): void => {
      if (commonJSRecords.has(record)) return;
      commonJSRecords.add(record);
      for (const dependency of record.dependencies) visitCommonJS(dependency);
    };
    for (const record of this.commonJS.values()) visitCommonJS(record);
    const invalidCommonJS = new Set<CommonJSRecord>();
    await Promise.all(
      [...commonJSRecords].map(async (record) => {
        try {
          // eslint-disable-next-line security/detect-non-literal-fs-filename -- Node-resolved module path.
          const source = await readFile(record.module.filename);
          if (
            this.state.failed ||
            this.commonJS.get(record.module.filename) !== record ||
            createHash("sha256").update(source).digest("hex") !==
              record.sourceHash
          )
            invalidCommonJS.add(record);
        } catch {
          invalidCommonJS.add(record);
        }
      }),
    );
    let cjsChanged = true;
    while (cjsChanged) {
      cjsChanged = false;
      for (const record of commonJSRecords) {
        if (
          !invalidCommonJS.has(record) &&
          [...record.dependencies].some((dep) => invalidCommonJS.has(dep))
        ) {
          invalidCommonJS.add(record);
          cjsChanged = true;
        }
      }
    }
    for (const [path, record] of this.commonJS) {
      if (invalidCommonJS.has(record)) next.evictions.set(path, record);
      else next.commonJS.set(path, record);
    }
    if (this.state.failed) return next;
    const records = new Set<ModuleRecord>();
    const visit = (record: ModuleRecord): void => {
      if (records.has(record)) return;
      records.add(record);
      for (const dependency of record.dependencies) visit(dependency);
    };
    for (const record of this.state.records.values()) visit(record);
    const invalid = new Set<ModuleRecord>();
    await Promise.all(
      [...records].map(async (record) => {
        try {
          // These are local URLs resolved by Node, not untrusted request paths.
          // eslint-disable-next-line security/detect-non-literal-fs-filename -- Compare Node-resolved local module source before reusing its evaluated instance.
          const source = await readFile(fileURLToPath(record.url), "utf8");
          if (
            record.failed ||
            !record.evaluated ||
            record.hasDynamicImport ||
            record.sourceHash === undefined ||
            hashModuleSource(source) !== record.sourceHash
          )
            invalid.add(record);
        } catch {
          invalid.add(record);
        }
      }),
    );
    // A fixed point handles reverse dependencies and cycles without assuming a DAG.
    let changed = true;
    while (changed) {
      changed = false;
      for (const record of records) {
        if (
          !invalid.has(record) &&
          [...record.dependencies].some((dep) => invalid.has(dep))
        ) {
          invalid.add(record);
          changed = true;
        }
      }
    }
    for (const record of records) {
      if (!invalid.has(record))
        next.state.reusable.set(canonicalURL(record.url), record);
    }
    return next;
  }

  /** Keep CommonJS identity on watcher refresh, but retain explicit uncached loads. */
  public async importCommonJS(pathName: string): Promise<unknown> {
    const resolved = requireModule.resolve(pathName);
    // Activate this generation's graph before evaluating an entry. Another
    // loader may have replaced Node's process-global cache in the meantime.
    // Keep pending invalidations until their modules have been recaptured.
    for (const path of this.evictions.keys()) {
      if (!this.commonJS.has(path))
        Reflect.deleteProperty(requireModule.cache, path);
    }
    if (this.watcherGeneration) {
      for (const [path, record] of this.commonJS)
        Reflect.set(requireModule.cache, path, record.module);
    }
    const previous = this.commonJS.get(resolved);
    if (this.watcherGeneration && previous !== undefined)
      return previous.module.exports;
    Reflect.deleteProperty(requireModule.cache, resolved);
    // A child already in Node's cache may have been evaluated from different
    // source than is on disk now. Never assign it a fresh provenance hash.
    const cachedBefore = new Set(Object.values(requireModule.cache));
    const exports = requireModule(resolved) as unknown;
    const pending: Promise<void>[] = [];
    const capture = (module: NodeModule): CommonJSRecord | undefined => {
      if (module.filename.includes("/node_modules/")) return undefined;
      const existing = this.commonJS.get(module.filename);
      if (existing?.module === module) return existing;
      const record: CommonJSRecord = { module, dependencies: new Set() };
      this.commonJS.set(module.filename, record);
      if (!cachedBefore.has(module))
        pending.push(
          (async () => {
            // eslint-disable-next-line security/detect-non-literal-fs-filename -- Record Node-resolved source identity.
            const source = await readFile(module.filename);
            record.sourceHash = createHash("sha256")
              .update(source)
              .digest("hex");
          })(),
        );
      for (const child of module.children) {
        const dependency = capture(child);
        if (dependency) record.dependencies.add(dependency);
      }
      return record;
    };
    const module = Reflect.get(requireModule.cache, resolved) as
      NodeModule | undefined;
    if (module) capture(module);
    await Promise.all(pending);
    return exports;
  }

  public async import(pathName: string): Promise<unknown> {
    registerGenerationHook();
    const record = recordFor(this.state, pathToFileURL(pathName).href, this.id);
    try {
      const imported = (await import(record.url)) as unknown;
      // A successful entry establishes successful evaluation of its static
      // dependency graph. Failed/unconfirmed modules must be retried, but a
      // syntax error in one route must not invalidate unrelated live contexts.
      const visited = new Set<ModuleRecord>();
      const confirm = (dependency: ModuleRecord): void => {
        if (visited.has(dependency) || dependency.failed) return;
        visited.add(dependency);
        dependency.evaluated = true;
        // A module can catch a rejected dynamic import and still evaluate
        // successfully. Its lazy children are not thereby known to have run.
        if (dependency.hasDynamicImport) return;
        for (const child of dependency.dependencies) confirm(child);
      };
      confirm(record);
      return imported;
    } catch (error) {
      record.failed = true;
      throw error;
    }
  }
}
