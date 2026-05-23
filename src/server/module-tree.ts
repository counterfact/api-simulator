import type { Module, MiddlewareFunction } from "./registry.js";

interface Route {
  methods: { [key: string]: string };
  path: string;
}

interface File {
  isWildcard: boolean;
  module: Module;
  name: string;
  rawName: string;
}

interface Directory {
  directories: Map<string, Directory>;
  files: Map<string, File>;
  isWildcard: boolean;
  name: string;
  rawName: string;
  middleware?: MiddlewareFunction;
}

interface Match {
  ambiguous?: boolean;
  matchedPath: string;
  module: Module;
  pathVariables: { [key: string]: string };
}

function isDirectory(test: Directory | undefined): test is Directory {
  return test !== undefined;
}

/**
 * Trie-based tree that maps URL path segments to route-handler modules.
 *
 * Each node in the tree represents one URL segment.  Segments whose names are
 * wrapped in curly braces (e.g. `{petId}`) are treated as wildcards and can
 * match any value in that position.
 *
 * The tree supports:
 * - **Exact matches** — literal URL segments take precedence over wildcards.
 * - **Wildcard matches** — `{param}` segments capture the matched value as a
 *   path variable.
 * - **Ambiguous-wildcard detection** — when multiple wildcards exist at the
 *   same level the match is flagged as `ambiguous` and an error is logged.
 */
export class ModuleTree {
  public readonly root: Directory = {
    directories: new Map(),
    files: new Map(),
    isWildcard: false,
    name: "",
    rawName: "",
  };

  private putDirectory(directory: Directory, segments: string[]): Directory {
    const [segment, ...remainingSegments] = segments;

    if (segment === undefined) {
      throw new Error("segments array is empty");
    }

    if (remainingSegments.length === 0) {
      return directory;
    }

    const isNewDirectory = !directory.directories.has(segment.toLowerCase());

    if (isNewDirectory) {
      directory.directories.set(segment.toLowerCase(), {
        directories: new Map(),
        files: new Map(),
        isWildcard: segment.startsWith("{"),
        name: segment.replace(/^\{(?<name>.*)\}$/u, "$<name>"),
        rawName: segment,
      });
    }

    const nextDirectory = directory.directories.get(
      segment.toLowerCase(),
    ) as Directory;

    if (isNewDirectory && segment.startsWith("{")) {
      const ambiguousWildcardDirectories = Array.from(
        directory.directories.values(),
      ).filter((subdirectory) => subdirectory.isWildcard);

      if (ambiguousWildcardDirectories.length > 1) {
        process.stderr.write(
          `[counterfact] ERROR: Ambiguous wildcard paths detected. Multiple wildcard directories exist at the same level: ${ambiguousWildcardDirectories.map((d) => d.rawName).join(", ")}. Requests may be routed unpredictably.\n`,
        );
      }
    }

    return this.putDirectory(nextDirectory, remainingSegments);
  }

  private addModuleToDirectory(
    directory: Directory | undefined,
    segments: string[],
    module: Module,
  ) {
    if (directory === undefined) {
      return;
    }

    const targetDirectory = this.putDirectory(directory, segments);

    const filename = segments.at(-1);

    if (filename === undefined) {
      throw new Error(
        "The file name (the last segment of the URL) is undefined. This is theoretically impossible but TypeScript can't enforce it.",
      );
    }

    targetDirectory.files.set(filename, {
      isWildcard: filename.startsWith("{"),
      module,
      name: filename.replace(/^\{(?<name>.*)\}$/u, "$<name>"),
      rawName: filename,
    });

    if (filename.startsWith("{")) {
      const ambiguousWildcardFiles = Array.from(
        targetDirectory.files.values(),
      ).filter((file) => file.isWildcard);

      if (ambiguousWildcardFiles.length > 1) {
        process.stderr.write(
          `[counterfact] ERROR: Ambiguous wildcard paths detected. Multiple wildcard files exist at the same path level: ${ambiguousWildcardFiles.map((f) => f.rawName).join(", ")}. Requests may be routed unpredictably.\n`,
        );
      }
    }
  }

  /**
   * Registers a module at the given URL pattern.
   *
   * @param url - The route URL pattern (e.g. `"/pets/{petId}"`).
   * @param module - The route-handler module to associate with the URL.
   */
  public add(url: string, module: Module) {
    this.addModuleToDirectory(this.root, url.split("/").slice(1), module);
  }

  private removeModuleFromDirectory(
    directory: Directory | undefined,
    segments: string[],
  ) {
    if (!isDirectory(directory)) {
      return;
    }

    const [segment, ...remainingSegments] = segments;

    if (segment === undefined) {
      return;
    }

    if (remainingSegments.length === 0) {
      directory.files.delete(segment.toLowerCase());

      return;
    }

    this.removeModuleFromDirectory(
      directory.directories.get(segment.toLowerCase()),
      remainingSegments,
    );
  }

  /**
   * Removes the module registered at `url`.
   *
   * @param url - The route URL pattern to deregister.
   */
  public remove(url: string) {
    const segments = url.split("/").slice(1);

    this.removeModuleFromDirectory(this.root, segments);
  }

  private fileModuleDefined(file: File, method: string) {
    return (file.module as { [key: string]: unknown })[method] !== undefined;
  }

  private buildMatch(
    directory: Directory,
    segment: string,
    pathVariables: { [key: string]: string },
    matchedPath: string,
    method: string,
  ): Match | undefined {
    function normalizedSegment(segment: string, directory: Directory) {
      for (const file of directory.files.keys()) {
        if (file.toLowerCase() === segment.toLowerCase()) {
          return file;
        }
      }
      return "";
    }

    const exactMatchFile = directory.files.get(
      normalizedSegment(segment, directory),
    );

    // If the URL segment literally matches a file key (e.g., requesting "/{x}"
    // as a literal URL value), exactMatchFile may be a wildcard file. In that
    // case, fall through to wildcard matching below.
    if (exactMatchFile !== undefined && !exactMatchFile.isWildcard) {
      return {
        ...exactMatchFile,
        matchedPath: `${matchedPath}/${exactMatchFile.rawName}`,
        pathVariables,
      };
    }

    const wildcardFiles = Array.from(directory.files.values()).filter(
      (file) => file.isWildcard && this.fileModuleDefined(file, method),
    );

    if (wildcardFiles.length > 1) {
      const firstWildcard = wildcardFiles[0] as File;

      return {
        ...firstWildcard,
        ambiguous: true,
        matchedPath: `${matchedPath}/${firstWildcard.rawName}`,
        pathVariables: {
          ...pathVariables,
          [firstWildcard.name]: segment,
        },
      };
    }

    const match = exactMatchFile ?? wildcardFiles[0];

    if (match === undefined) {
      return undefined;
    }

    if (match.isWildcard) {
      return {
        ...match,

        matchedPath: `${matchedPath}/${match.rawName}`,

        pathVariables: {
          ...pathVariables,
          [match.name]: segment,
        },
      };
    }

    return {
      ...match,

      matchedPath: `${matchedPath}/${match.rawName}`,

      pathVariables,
    };
  }

  private matchWithinDirectory(
    directory: Directory,
    segments: string[],
    pathVariables: { [key: string]: string },
    matchedPath: string,
    method: string,
  ): Match | undefined {
    if (segments.length === 0) {
      return undefined;
    }

    const [segment, ...remainingSegments] = segments;

    if (segment === undefined) {
      throw new Error(
        "segment cannot be undefined but TypeScript doesn't know that",
      );
    }

    if (
      remainingSegments.length === 0 ||
      (remainingSegments.length === 1 && remainingSegments[0] === "")
    ) {
      return this.buildMatch(
        directory,
        segment,
        pathVariables,
        matchedPath,
        method,
      );
    }

    const exactMatch = directory.directories.get(segment.toLowerCase());

    if (isDirectory(exactMatch)) {
      return this.matchWithinDirectory(
        exactMatch,
        remainingSegments,
        pathVariables,
        `${matchedPath}/${segment}`,
        method,
      );
    }

    const wildcardDirectories = Array.from(
      directory.directories.values(),
    ).filter((subdirectory) => subdirectory.isWildcard);

    const wildcardMatches: Match[] = [];

    for (const wildcardDirectory of wildcardDirectories) {
      const wildcardMatch = this.matchWithinDirectory(
        wildcardDirectory,
        remainingSegments,
        {
          ...pathVariables,
          [wildcardDirectory.name]: segment,
        },
        `${matchedPath}/${wildcardDirectory.rawName}`,
        method,
      );

      if (wildcardMatch !== undefined) {
        wildcardMatches.push(wildcardMatch);
      }
    }

    if (wildcardMatches.length > 1) {
      const firstMatch = wildcardMatches[0] as Match;

      return { ...firstMatch, ambiguous: true };
    }

    return wildcardMatches[0];
  }

  /**
   * Finds the best-matching module for `url` and `method`.
   *
   * Traverses the trie, preferring exact matches over wildcards at each
   * segment.  Returns `undefined` when no match is found.
   *
   * @param url - The incoming request URL.
   * @param method - The HTTP method (used to validate wildcard matches).
   * @returns A {@link Match} object, or `undefined` when nothing matches.
   */
  public match(url: string, method: string) {
    return this.matchWithinDirectory(
      this.root,
      url.split("/").slice(1),
      {},
      "",
      method,
    );
  }

  /** Returns all registered routes sorted alphabetically by path. */
  public get routes(): Route[] {
    const routes: Route[] = [];

    function traverse(directory: Directory, path: string) {
      directory.directories.forEach((subdirectory) => {
        traverse(subdirectory, `${path}/${subdirectory.rawName}`);
      });

      directory.files.forEach((file) => {
        const methods: [string, string][] = Object.entries(file.module).map(
          ([method, implementation]) => [method, String(implementation)],
        );

        routes.push({
          methods: Object.fromEntries(methods),
          path: `${path}/${file.rawName}`,
        });
      });
    }

    function stripBrackets(string: string) {
      return string.replaceAll(/\{|\}/gu, "");
    }

    traverse(this.root, "");

    return routes.sort((first, second) =>
      stripBrackets(first.path).localeCompare(stripBrackets(second.path)),
    );
  }
}
