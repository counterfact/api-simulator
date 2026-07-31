import repl from "node:repl";

import type { Config } from "../server/config.js";
import type { ChaosRegistry } from "../server/chaos.js";
import type { ContextRegistry } from "../server/context-registry.js";
import type { OpenApiDocument } from "../server/dispatcher.js";
import type { Registry } from "../server/registry.js";
import type { ScenarioRegistry } from "../server/scenario-registry.js";
import { sendTelemetry } from "../cli/telemetry.js";

import { RawHttpClient } from "./raw-http-client.js";
import { createRouteFunction } from "./route-builder.js";

function printToStdout(line: string) {
  process.stdout.write(`${line}\n`);
}

export type CompleterCallback = (
  err: Error | null,
  result: [string[], string],
) => void;

export interface ReplApiBinding {
  contextRegistry: ContextRegistry;
  group: string;
  openApiDocument?: OpenApiDocument;
  registry: Registry;
  scenarioRegistry?: ScenarioRegistry;
}

const ROUTE_BUILDER_METHODS = [
  "body(",
  "headers(",
  "help(",
  "method(",
  "missing(",
  "path(",
  "query(",
  "ready(",
  "send(",
];

function getScenarioCompletions(
  line: string,
  scenarioRegistry: ScenarioRegistry | undefined,
  groupedScenarioRegistries?: Record<string, ScenarioRegistry | undefined>,
): [string[], string] | undefined {
  function getPathCompletions(
    partial: string,
    registry: ScenarioRegistry | undefined,
  ): [string[], string] {
    if (registry === undefined) {
      return [[], partial];
    }

    const slashIdx = partial.lastIndexOf("/");

    if (slashIdx === -1) {
      const indexFunctions = registry.getExportedFunctionNames("index");
      const fileKeys = registry.getFileKeys().filter((k) => k !== "index");
      const topLevelPrefixes = [
        ...new Set(fileKeys.map((k) => k.split("/")[0] + "/")),
      ];
      const allOptions = [...indexFunctions, ...topLevelPrefixes];
      const matches = allOptions.filter((c) => c.startsWith(partial));

      return [matches, partial];
    }

    const fileKey = partial.slice(0, slashIdx);
    const funcPartial = partial.slice(slashIdx + 1);
    const functions = registry.getExportedFunctionNames(fileKey);
    const matches = functions
      .filter((e) => e.startsWith(funcPartial))
      .map((e) => `${fileKey}/${e}`);

    return [matches, partial];
  }

  if (groupedScenarioRegistries !== undefined) {
    if (!/^\.scenario(?:\s|$)/u.test(line)) {
      return undefined;
    }

    const hasTrailingWhitespace = /\s$/u.test(line);
    const args = line.trim().split(/\s+/u).slice(1);
    const groupKeys = Object.keys(groupedScenarioRegistries);

    if (args.length === 0) {
      return [groupKeys, ""];
    }

    if (args.length === 1 && !hasTrailingWhitespace) {
      const groupPartial = args[0] ?? "";
      const matches = groupKeys.filter((key) => key.startsWith(groupPartial));

      return [matches, groupPartial];
    }

    const selectedGroup = args[0] ?? "";
    const selectedRegistry = groupedScenarioRegistries[selectedGroup];

    if (selectedRegistry === undefined) {
      const scenarioPartial = hasTrailingWhitespace
        ? ""
        : (args[args.length - 1] ?? "");

      return [[], scenarioPartial];
    }

    if (args.length === 1 && hasTrailingWhitespace) {
      return getPathCompletions("", selectedRegistry);
    }

    if (args.length === 2 && !hasTrailingWhitespace) {
      const scenarioPartial = args[1];

      if (scenarioPartial === undefined) {
        return [[], ""];
      }

      return getPathCompletions(scenarioPartial, selectedRegistry);
    }

    // More than two args (or trailing whitespace after the second arg) means
    // no additional `.scenario` arguments are valid in multi-API mode.
    return [[], args[args.length - 1] ?? ""];
  }

  const applyMatch = line.match(/^\.scenario\s+(?<partial>\S*)$/u);

  if (!applyMatch) {
    return undefined;
  }

  const partial = applyMatch.groups?.["partial"] ?? "";
  return getPathCompletions(partial, scenarioRegistry);
}

function getRouteBuilderMethodCompletions(
  line: string,
): [string[], string] | undefined {
  const builderMatch = line.match(/route\(.*\)\.(?<partial>[a-zA-Z]*)$/u);

  if (!builderMatch) {
    return undefined;
  }

  const partial = builderMatch.groups?.["partial"] ?? "";
  const matches = ROUTE_BUILDER_METHODS.filter((m) => m.startsWith(partial));

  return [matches, partial];
}

function getRoutesForCompletion(
  registry: Registry,
  openApiDocument?: OpenApiDocument,
) {
  const openApiPaths = openApiDocument
    ? Object.keys(openApiDocument.paths)
    : [];

  if (openApiPaths.length > 0) {
    return openApiPaths;
  }

  return registry.routes.map((route) => route.path);
}

function getRouteCompletions(
  line: string,
  routes: string[],
): [string[], string] | undefined {
  const routeMatch = line.match(
    /(?:client\.(?:get|post|put|patch|delete)|route)\("(?<partial>[^"]*)$/u,
  );

  if (!routeMatch) {
    return undefined;
  }

  const partial = routeMatch.groups?.["partial"] ?? "";
  const matches = routes.filter((route) => route.startsWith(partial));

  return [matches, partial];
}

/**
 * Creates a tab-completion function for the REPL.
 *
 * @param registry - The route registry used to complete path arguments for `route()` and `client.*()` calls.
 * @param fallback - Optional fallback completer (e.g. the Node.js built-in completer) invoked when no custom completion matches.
 * @param openApiDocument - Optional OpenAPI document used as the source of route completions when available.
 * @param scenarioRegistry - When provided, enables tab completion for `.scenario` commands by enumerating
 *   exported function names and file-key prefixes from the loaded scenario modules.
 */
export function createCompleter(
  registry: Registry,
  fallback?: (line: string, callback: CompleterCallback) => void,
  openApiDocument?: OpenApiDocument,
  scenarioRegistry?: ScenarioRegistry,
  groupedScenarioRegistries?: Record<string, ScenarioRegistry | undefined>,
) {
  const routes = getRoutesForCompletion(registry, openApiDocument);

  return (line: string, callback: CompleterCallback): void => {
    const scenarioCompletions = getScenarioCompletions(
      line,
      scenarioRegistry,
      groupedScenarioRegistries,
    );

    if (scenarioCompletions !== undefined) {
      callback(null, scenarioCompletions);
      return;
    }

    const routeBuilderCompletions = getRouteBuilderMethodCompletions(line);

    if (routeBuilderCompletions !== undefined) {
      callback(null, routeBuilderCompletions);
      return;
    }

    const routeCompletions = getRouteCompletions(line, routes);

    if (routeCompletions === undefined) {
      if (fallback) {
        fallback(line, callback);
      } else {
        callback(null, [[], line]);
      }

      return;
    }

    callback(null, routeCompletions);
  };
}

/**
 * Launches the interactive Counterfact REPL.
 *
 * The REPL is a standard Node.js REPL augmented with:
 * - `context` / `loadContext(path)` globals wired to the {@link ContextRegistry}.
 * - `client` — a {@link RawHttpClient} pre-configured for `localhost`.
 * - `route(path)` — creates a {@link RouteBuilder} for the given path.
 * - `.counterfact` — help command.
 * - `.proxy` — proxy configuration command.
 * - `.scenario` — runs a named scenario function from the scenarios directory.
 *
 * @param contextRegistry - The live context registry.
 * @param registry - The route registry (used for tab completion).
 * @param config - Server configuration.
 * @param print - Output function; defaults to writing to `stdout`.
 * @param openApiDocument - Optional OpenAPI document for tab completion.
 * @param scenarioRegistry - Optional scenario registry for `.scenario` support.
 * @returns The configured Node.js REPL server instance.
 */
export function startRepl(
  contextRegistry: ContextRegistry,
  registry: Registry,
  config: Pick<Config, "port" | "proxyUrl" | "proxyPaths">,
  print = printToStdout,
  openApiDocument?: OpenApiDocument,
  scenarioRegistry?: ScenarioRegistry,
  apiBindings?: ReplApiBinding[],
  chaosRegistry?: ChaosRegistry,
) {
  const bindings =
    apiBindings === undefined || apiBindings.length === 0
      ? [
          {
            contextRegistry,
            group: "",
            openApiDocument,
            registry,
            scenarioRegistry,
          },
        ]
      : apiBindings;
  const isMultiApi = bindings.length > 1;
  const groupedBindings = bindings.map((binding) => ({
    ...binding,
    key: binding.group.trim(),
  }));

  if (isMultiApi) {
    const invalidBindings = groupedBindings.filter(
      (binding) => binding.key === "",
    );

    if (invalidBindings.length > 0) {
      throw new Error(
        "Each API binding must define a non-empty group when multiple APIs are configured.",
      );
    }

    const seenGroups = new Set<string>();
    const duplicateGroups = new Set<string>();

    for (const binding of groupedBindings) {
      if (seenGroups.has(binding.key)) {
        duplicateGroups.add(binding.key);
      }
      seenGroups.add(binding.key);
    }
  }

  const rootBinding = groupedBindings[0];

  if (rootBinding === undefined) {
    throw new Error("startRepl requires at least one API binding");
  }
  const groupedLoadContext = Object.fromEntries(
    groupedBindings.map((binding) => [
      binding.key,
      (path: string) => binding.contextRegistry.find(path),
    ]),
  ) as Record<string, (path: string) => Record<string, unknown>>;
  const groupedRoute = Object.fromEntries(
    groupedBindings.map((binding) => [
      binding.key,
      createRouteFunction(config.port, "localhost", binding.openApiDocument),
    ]),
  ) as Record<string, (path: string) => unknown>;

  function printProxyStatus() {
    if (config.proxyUrl === "") {
      print("The proxy URL is not set.");
      print('To set it, type ".proxy url <url>');

      return;
    }

    print("Proxy Configuration:");
    print("");
    print(`The proxy URL is ${config.proxyUrl}`);
    print("");
    print("Paths prefixed with [+] will be proxied.");
    print("Paths prefixed with [-] will not be proxied.");
    print("");

    const entries = [...config.proxyPaths.entries()].sort(([path1], [path2]) =>
      path1 < path2 ? -1 : 1,
    );

    for (const [path, state] of entries) {
      print(`${state ? "[+]" : "[-]"} ${path}/`);
    }
  }

  function setProxyUrl(url: string | undefined) {
    if (url === undefined) {
      print("usage: .proxy url <url>");

      return;
    }

    config.proxyUrl = url;
    print(`proxy URL is set to ${url}`);
  }

  function turnProxyOnOrOff(text: string) {
    const [command, endpoint] = text.split(" ");

    const printEndpoint =
      endpoint === undefined || endpoint === "" ? "/" : endpoint;

    config.proxyPaths.set(
      (endpoint ?? "").replace(/\/$/u, ""),
      command === "on",
    );

    if (command === "on") {
      print(
        `Requests to ${printEndpoint} will be proxied to ${
          config.proxyUrl || "<proxy URL>"
        }${printEndpoint}`,
      );
    }

    if (command === "off") {
      print(`Requests to ${printEndpoint} will be handled by local code`);
    }
  }

  const replServer = repl.start({
    prompt: "\x1b[38;2;0;113;181m⬣> \x1b[0m",
  });

  const builtinCompleter = replServer.completer as (
    line: string,
    callback: CompleterCallback,
  ) => void;

  // completer is typed as readonly in @types/node but is writable at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (replServer as any).completer = createCompleter(
    rootBinding.registry,
    builtinCompleter,
    rootBinding.openApiDocument,
    rootBinding.scenarioRegistry,
    isMultiApi
      ? Object.fromEntries(
          groupedBindings.map((binding) => [
            binding.key,
            binding.scenarioRegistry,
          ]),
        )
      : undefined,
  );

  replServer.defineCommand("counterfact", {
    action() {
      sendTelemetry("repl_command_used", { command: "counterfact" });
      print(
        "This is a read-eval-print loop (REPL), the same as the one you get when you run node with no arguments.",
      );
      print(
        "Except that it's connected to the running server, which you can access with the following globals:",
      );
      print("");
      print(
        "- loadContext('/some/path'): to access the context object for a given path",
      );
      print("- context: the root context ( same as loadContext('/') )");
      print(
        "- route('/some/path'): create a request builder for the given path",
      );
      print("");
      print(
        "For more information, see https://github.com/counterfact/api-simulator/blob/main/docs/usage.md",
      );
      print("");

      this.clearBufferedCommand();
      this.displayPrompt();
    },

    help: "Get help with Counterfact",
  });

  replServer.defineCommand("proxy", {
    action(text: string) {
      sendTelemetry("repl_command_used", { command: "proxy" });
      if (text === "help" || text === "") {
        print(".proxy [on|off] - turn the proxy on/off at the root level");
        print(".proxy [on|off] <path-prefix> - turn the proxy on for a path");
        print(".proxy status - show the proxy status");
        print(".proxy help - show this message");
      } else if (text.startsWith("url")) {
        setProxyUrl(text.split(" ")[1]);
      } else if (text === "status") {
        printProxyStatus();
      } else {
        turnProxyOnOrOff(text);
      }

      this.clearBufferedCommand();
      this.displayPrompt();
    },

    help: 'proxy configuration (".proxy help" for details)',
  });

  replServer.context.loadContext = isMultiApi
    ? groupedLoadContext
    : groupedLoadContext[rootBinding.key];

  replServer.context.context = isMultiApi
    ? Object.fromEntries(
        groupedBindings.map((binding) => [
          binding.key,
          binding.contextRegistry.find("/"),
        ]),
      )
    : rootBinding.contextRegistry.find("/");

  replServer.context.client = new RawHttpClient("localhost", config.port);
  replServer.context.RawHttpClient = RawHttpClient;

  replServer.context.route = isMultiApi
    ? groupedRoute
    : groupedRoute[rootBinding.key];

  replServer.context.routes = isMultiApi
    ? Object.fromEntries(groupedBindings.map((binding) => [binding.key, {}]))
    : {};

  if (chaosRegistry !== undefined) {
    replServer.context.chaos = (pathPrefix = "") =>
      chaosRegistry.createRule(pathPrefix);
  }

  replServer.defineCommand("scenario", {
    async action(text: string) {
      sendTelemetry("repl_command_used", { command: "scenario" });
      const trimmedText = text.trim();
      const parsedArgs = trimmedText.split(/\s+/u).filter(Boolean);
      const usage = isMultiApi
        ? "usage: .scenario <group> <path>"
        : "usage: .scenario <path>";
      const { selectedBinding, scenarioPath } = (() => {
        if (!isMultiApi) {
          if (trimmedText === "") {
            return { scenarioPath: undefined, selectedBinding: undefined };
          }

          return { scenarioPath: trimmedText, selectedBinding: rootBinding };
        }

        if (parsedArgs.length !== 2) {
          return { scenarioPath: undefined, selectedBinding: undefined };
        }

        return {
          scenarioPath: parsedArgs[1],
          selectedBinding: groupedBindings.find(
            (binding) => binding.key === parsedArgs[0],
          ),
        };
      })();

      if (selectedBinding === undefined || scenarioPath === undefined) {
        if (
          isMultiApi &&
          scenarioPath !== undefined &&
          selectedBinding === undefined
        ) {
          const groupName = parsedArgs[0] ?? "";
          const availableGroups = groupedBindings.map((binding) => binding.key);

          print(
            `Error: Unknown API group "${groupName}". Available groups: ${availableGroups.join(", ")}`,
          );
        } else {
          print(usage);
        }

        this.clearBufferedCommand();
        this.displayPrompt();
        return;
      }

      const parts = scenarioPath.split("/").filter(Boolean);

      if (parts.length === 0) {
        print(usage);
        this.clearBufferedCommand();
        this.displayPrompt();
        return;
      }

      if (parts.some((part) => part === ".." || part === ".")) {
        print("Error: Path must not contain '.' or '..' segments");
        this.clearBufferedCommand();
        this.displayPrompt();
        return;
      }

      const functionName = parts[parts.length - 1] ?? "";
      const fileKey =
        parts.length === 1 ? "index" : parts.slice(0, -1).join("/");

      const module = selectedBinding.scenarioRegistry?.getModule(fileKey);

      if (module === undefined) {
        print(`Error: Could not find scenario file "${fileKey}"`);
        this.clearBufferedCommand();
        this.displayPrompt();
        return;
      }

      const fn = module[functionName];

      if (typeof fn !== "function") {
        print(
          `Error: "${functionName}" is not a function exported from "${fileKey}"`,
        );
        this.clearBufferedCommand();
        this.displayPrompt();
        return;
      }

      try {
        const selectedRoutes = isMultiApi
          ? (
              replServer.context["routes"] as Record<
                string,
                Record<string, unknown>
              >
            )[selectedBinding.key]
          : (replServer.context["routes"] as Record<string, unknown>);

        if (isMultiApi && selectedRoutes === undefined) {
          print(
            `Error: Could not resolve routes for API group "${selectedBinding.key}"`,
          );
          this.clearBufferedCommand();
          this.displayPrompt();
          return;
        }

        const applyContext = {
          context: selectedBinding.contextRegistry.find("/") as Record<
            string,
            unknown
          >,
          loadContext: ((path: string) =>
            selectedBinding.contextRegistry.find(path)) as (
            path: string,
          ) => Record<string, unknown>,
          route: groupedRoute[selectedBinding.key] as (path: string) => unknown,
          routes: selectedRoutes,
        };

        await (fn as (ctx: typeof applyContext) => Promise<void> | void)(
          applyContext,
        );

        print(`Applied ${text.trim()}`);
      } catch (error) {
        print(`Error: ${String(error)}`);
      }

      this.clearBufferedCommand();
      this.displayPrompt();
    },

    help: isMultiApi
      ? 'apply a scenario script (".scenario <group> <path>" calls the named export from that group\'s scenarios/)'
      : 'apply a scenario script (".scenario <path>" calls the named export from scenarios/)',
  });

  return replServer;
}
