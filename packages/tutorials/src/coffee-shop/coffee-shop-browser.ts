import type { ReplSubmission } from "./coffee-shop-repl.js";
import type { EditEvent, FileChange } from "./coffee-shop-workspace.js";
import type { LessonPhase } from "./coffee-shop-lessons.js";
import type { WorkflowResult } from "./coffee-shop-workflow.js";

/** Serialized into the page; keep all browser dependencies inside this function. */
export function runCoffeeShopWalkthrough(
  projectPath: string,
  phases: LessonPhase[],
  restartDirectory: string,
  restartCommand: string,
  walkthroughVersion = 6,
  baselineProducts: {
    id: string;
    name: string;
    description: string;
    price: number;
    stock: number;
  }[] = [],
) {
  type Product = {
    id: string;
    name: string;
    description: string;
    price: number;
    stock: number;
  };
  type Item = { productId: string; quantity: number };
  type Info = {
    workspace?: {
      enabled: boolean;
      prepared: string[];
      checkpoints: number[];
      changes?: EditEvent[];
      locations?: Record<string, Record<string, number>>;
      schemaFile?: string;
    };
    replSubmissions?: ReplSubmission[];
    sessionId: string;
    revision: string;
    state: { catalog: unknown; inventory: Record<string, number> | null };
  };
  type Observation = { before: number; after: number; quantity: number };
  const byId = (id: string) => document.getElementById(id)!;
  function setupPanelDivider() {
    const layout = byId("walkthrough-layout");
    const divider = byId("panel-divider");
    const storageKey = "counterfact-coffee-panel-split";
    let share = 0.5;
    let pointer: number | undefined;
    function resize(requested: number) {
      const width = layout.getBoundingClientRect().width - 12;
      const minimum = Math.min(0.5, 360 / Math.max(1, width));
      share = Math.max(minimum, Math.min(1 - minimum, requested));
      layout.style.setProperty("--guide-share", String(share));
      divider.setAttribute("aria-valuemin", String(Math.round(minimum * 100)));
      divider.setAttribute(
        "aria-valuemax",
        String(Math.round((1 - minimum) * 100)),
      );
      divider.setAttribute("aria-valuenow", String(Math.round(share * 100)));
      divider.setAttribute(
        "aria-valuetext",
        "Chat panel " + Math.round(share * 100) + "%",
      );
    }
    function remember() {
      try {
        sessionStorage.setItem(storageKey, String(share));
      } catch {
        /* Resizing also works when storage is unavailable. */
      }
    }
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved !== null && Number.isFinite(Number(saved)))
        share = Number(saved);
    } catch {
      /* Use the default split when storage is unavailable. */
    }
    resize(share);
    divider.onpointerdown = (event) => {
      if (
        event.button !== 0 ||
        event.isPrimary === false ||
        pointer !== undefined
      )
        return;
      pointer = event.pointerId;
      layout.dataset.resizing = "true";
      divider.setPointerCapture(pointer);
      event.preventDefault();
    };
    divider.onpointermove = (event) => {
      if (event.pointerId !== pointer) return;
      const bounds = layout.getBoundingClientRect();
      resize(
        (event.clientX - bounds.left - 6) / Math.max(1, bounds.width - 12),
      );
    };
    const stop = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      const captured = pointer;
      pointer = undefined;
      delete layout.dataset.resizing;
      if (captured !== undefined && divider.hasPointerCapture(captured))
        divider.releasePointerCapture(captured);
      remember();
    };
    divider.onpointerup = stop;
    divider.onpointercancel = stop;
    divider.onlostpointercapture = stop;
    divider.onkeydown = (event) => {
      const step = event.shiftKey ? 0.1 : 0.02;
      if (event.key === "ArrowLeft") resize(share - step);
      else if (event.key === "ArrowRight") resize(share + step);
      else if (event.key === "Home") resize(0);
      else if (event.key === "End") resize(1);
      else return;
      event.preventDefault();
      remember();
    };
    window.addEventListener("resize", () => resize(share));
  }
  const node = (tag: string, text = "", className = "") => {
    const result = document.createElement(tag);
    if (tag === "pre") {
      const code = document.createElement("code");
      code.textContent = text;
      result.append(code);
    } else result.textContent = text;
    result.className = className;
    return result;
  };
  const button = (text: string, action: () => unknown, advances = true) => {
    const result = node("button", text, "secondary") as HTMLButtonElement;
    result.onclick = () => {
      if (advances) acknowledgeVisibleMessages();
      return action();
    };
    return result;
  };
  const equal = (left: unknown, right: unknown) =>
    JSON.stringify(left) === JSON.stringify(right);
  const inventoryOf = () =>
    Object.fromEntries(products.map((product) => [product.id, product.stock]));
  const phase = () => phases[index]!;
  const missing = () =>
    phases.slice(0, index).find((candidate) => !completed.has(candidate.id));
  const money = (cents: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  const storageKey = "counterfact-coffee-v" + walkthroughVersion;
  const origin = window.location.origin;
  let index = 0,
    products: Product[] = [],
    fresh = false,
    busy = false;
  let checking: Promise<void> | undefined;
  let cart = new Map<string, number>(),
    completed = new Set<string>();
  let info: Info,
    checkedRevision = "",
    checkedPhase = "",
    ready = false;
  let checkMessage = "",
    quizWrong = false;
  let observation: Observation | undefined, failedItems: Item[] | undefined;
  let expectedExamples: string[] | undefined;
  let entryState: Info["state"] | undefined;
  let catalogReads = 0,
    lastCatalog = "",
    orderIds: number[] = [],
    rejectionSeen = false;
  let resumeCheckpoint: number | undefined;
  const diffStates: Record<string, boolean> = {};
  type HttpExchange = {
    id: string;
    method: "GET" | "POST";
    url: string;
    handler: string;
    requestHeaders: Record<string, string>;
    requestBody?: unknown;
    status?: number;
    responseHeaders?: Record<string, string>;
    responseBody?: unknown;
    responseText?: string;
    pending: boolean;
    error?: string;
    reason?: string;
  };
  type Turn = {
    phaseId: string;
    role: "you" | "tutor";
    text: string;
    files?: FileChange[];
    exchanges?: HttpExchange[];
    command?: string;
    verificationRevision?: string;
    waitForAction?: boolean;
    hint?: string;
  };
  type Proposal = {
    files?: FileChange[];
    revision?: string;
    sourceRevision: string;
    error?: string;
    applying?: boolean;
  };
  const proposals = new Map<string, Proposal>();
  const revealedMessages: Record<string, number> = {};
  const displayedMessages = new Set<string>();
  const revealedHints = new Map<string, { messageId: string; text: string }>();
  let messageAllowance = 1;
  let folderOpened = false;
  let typing: { id: string; shown: number } | undefined;
  let typingTimer: ReturnType<typeof setTimeout> | undefined;
  const reducedMotion = () =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  async function loadProposal(phaseId: string, force = false) {
    const candidate = phases.find((candidate) => candidate.id === phaseId)!;
    if (
      !candidate.preparation ||
      !info?.workspace?.enabled ||
      info.workspace.prepared.includes(phaseId) ||
      completed.has(phaseId) ||
      missing()
    )
      return;
    if (!force && proposals.get(phaseId)?.sourceRevision === info.revision)
      return;
    if (!force && proposals.get(phaseId)?.applying) return;
    const sourceRevision = info.revision;
    try {
      const { value: result } = await json<{
        ok: boolean;
        message: string;
        files?: FileChange[];
        revision?: string;
      }>("/tutorial-workspace", {
        action: "preview",
        phaseId,
        sessionId: info.sessionId,
      });
      proposals.set(phaseId, {
        sourceRevision,
        files: result.files,
        revision: result.revision,
        error: result.ok ? undefined : result.message,
      });
    } catch (error) {
      proposals.set(phaseId, {
        sourceRevision,
        error:
          "Could not preview the changes: " +
          (error instanceof Error ? error.message : String(error)),
      });
    }
    renderLesson();
  }
  let seenChanges = new Set<number>();
  let seenReplSubmissions = new Set<string>();
  let turns: Turn[] = [];
  function record(
    role: Turn["role"],
    text: string,
    waitForAction = false,
    hint?: string,
  ) {
    const turn: Turn = { phaseId: phase().id, role, text, waitForAction, hint };
    turns.push(turn);
    save();
    return turn;
  }
  function uiAction(text: string) {
    const turn = record("you", text);
    renderLesson();
    return turn;
  }
  function describeItems(items: Item[]) {
    return items
      .map(
        (item) =>
          item.quantity +
          " × " +
          (products.find((product) => product.id === item.productId)?.name ??
            item.productId),
      )
      .join(", ");
  }
  function syncChanges(changes: EditEvent[] = []) {
    let changed = false;
    for (const edit of changes) {
      if (seenChanges.has(edit.id)) continue;
      seenChanges.add(edit.id);
      const phaseId = edit.phaseId ?? phase().id;
      if (!phases.some((candidate) => candidate.id === phaseId)) continue;
      if (edit.actor === "you") acknowledgeVisibleMessages();
      turns.push({
        phaseId,
        role: edit.actor === "milo" ? "tutor" : "you",
        text:
          edit.actor === "milo"
            ? "Here are the edits I made."
            : "Your saved changes",
        files: edit.files,
      });
      changed = true;
    }
    if (changed) save();
    return changed;
  }
  function syncReplSubmissions(entries: ReplSubmission[] = []) {
    let changed = false;
    for (const entry of entries) {
      if (seenReplSubmissions.has(entry.id)) continue;
      seenReplSubmissions.add(entry.id);
      acknowledgeVisibleMessages();
      turns.push({
        phaseId: phase().id,
        role: "you",
        text: "Submitted in the REPL",
        command: entry.command,
      });
      changed = true;
    }
    if (changed) save();
    return changed;
  }
  const reported = new Set<string>();
  function save() {
    if (!info) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          version: walkthroughVersion,
          sessionId: info.sessionId,
          index,
          completed: [...completed],
          turns,
          seenChanges: [...seenChanges],
          seenReplSubmissions: [...seenReplSubmissions],
          quizWrong,
          cart: [...cart],
          observation,
          failedItems,
          entryState,
          catalogReads,
          lastCatalog,
          orderIds,
          rejectionSeen,
          resumeCheckpoint,
          diffStates,
          revealedMessages,
          displayedMessages: [...displayedMessages],
          revealedHints: [...revealedHints],
          folderOpened,
        }),
      );
    } catch {
      /* Storage may be unavailable. */
    }
  }
  function report(event: string, phaseId = phase().id) {
    const key = event + ":" + phaseId;
    if (reported.has(key)) return;
    reported.add(key);
    json("/tutorial-event", { event, phaseId }).catch(() =>
      reported.delete(key),
    );
  }
  async function json<T = unknown>(
    path: string,
    body?: unknown,
    action?: Turn,
    reason?: string,
  ) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 4000);
    const shopRequest = path === "/products" || path === "/orders";
    const requestPath =
      walkthroughVersion >= 4
        ? shopRequest
          ? "/shop" + path
          : path.replace("/tutorial-", "/tutorial/")
        : path;
    const snapshot = (value: unknown) =>
      value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    let exchange: HttpExchange | undefined;
    if (action && shopRequest) {
      action.exchanges ??= [];
      exchange = {
        id: turns.indexOf(action) + ":" + action.exchanges.length,
        method: body === undefined ? "GET" : "POST",
        url: origin + requestPath,
        handler:
          path === "/products" ? "routes/products.ts" : "routes/orders.ts",
        requestHeaders:
          body === undefined ? {} : { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { requestBody: snapshot(body) }),
        pending: true,
        ...(reason ? { reason } : {}),
      };
      action.exchanges.push(exchange);
      save();
      renderLesson();
    }
    try {
      const response = await fetch(requestPath, {
        signal: controller.signal,
        ...(body === undefined
          ? {}
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      }).catch((error: unknown) => {
        showConnectionAlert(true);
        throw error;
      });
      showConnectionAlert(false);
      if (exchange) {
        exchange.status = response.status;
        exchange.responseHeaders = {};
        response.headers?.forEach((value, name) => {
          exchange!.responseHeaders![name] = value;
        });
      }
      let value: T;
      if (shopRequest && typeof response.text === "function") {
        const raw = await response.text();
        if (exchange) {
          exchange.responseBody = raw;
          exchange.responseText = raw;
        }
        try {
          value = JSON.parse(raw) as T;
        } catch (error) {
          throw new Error(
            "The API response is not valid JSON. Inspect the recorded HTTP exchange before retrying.",
            { cause: error },
          );
        }
      } else value = (await response.json()) as T;
      if (exchange) exchange.responseBody = snapshot(value);
      return { response, value };
    } catch (error) {
      if (exchange)
        exchange.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      clearTimeout(timer);
      if (exchange) {
        exchange.pending = false;
        save();
        renderLesson();
      }
    }
  }
  function showConnectionAlert(offline: boolean) {
    const alert = byId("connection-alert");
    alert.hidden = !offline;
    if (!offline || alert.children.length) return;
    alert.append(
      node("strong", "The walkthrough server is offline or unreachable."),
      node(
        "p",
        "You may have stopped Counterfact in the terminal. This page will reconnect automatically when the server returns. Check the terminal for errors and restart Counterfact if it stopped.",
      ),
      node("p", "Run this from " + restartDirectory + ":"),
      node(
        "pre",
        restartCommand.replace("openapi.yaml", schemaFile("openapi.yaml")) +
          " --port " +
          (window.location.port || "3100"),
      ),
    );
  }
  function fileLink(file: string, label = file, line = 1) {
    file = schemaFile(file);
    const result = node("a", label) as HTMLAnchorElement;
    const base = new URL("vscode://file/");
    base.pathname =
      (projectPath.startsWith("/") || /^[A-Za-z]:/u.test(projectPath)
        ? ""
        : "/") +
      projectPath.replace(/\\/gu, "/") +
      "/";
    result.href = new URL(file, base).href + (file ? ":" + line : "");
    result.title = "Open in VSCode" + (file ? " at line " + line : "");
    return result;
  }
  function editLine(file: string, phaseId = phase().id) {
    return info?.workspace?.locations?.[phaseId]?.[schemaFile(file)] ?? 1;
  }
  function schemaFile(file: string) {
    return file === "openapi.yaml"
      ? (info?.workspace?.schemaFile ?? file)
      : file;
  }
  function fileText(tag: string, text: string, phaseId = phase().id) {
    text = text.replaceAll("openapi.yaml", schemaFile("openapi.yaml"));
    const result = node(tag);
    result.dataset.prose = text;
    result.dataset.phase = phaseId;
    const files = [
      "routes/_.context.ts",
      "routes/products.ts",
      "routes/orders.ts",
      "scenarios/index.ts",
      "openapi.yaml",
      "openapi.json",
    ];
    while (text) {
      const inline = /`(?<code>[^`]+)`/u.exec(text);
      const match = files
        .map((file) => ({ file, index: text.indexOf(file) }))
        .filter((candidate) => candidate.index >= 0)
        .sort((a, b) => a.index - b.index)[0];
      if (inline && (!match || inline.index <= match.index)) {
        if (inline.index)
          result.append(node("span", text.slice(0, inline.index)));
        const code = node("code");
        if (files.includes(inline[1]!))
          code.append(
            fileLink(inline[1]!, inline[1]!, editLine(inline[1]!, phaseId)),
          );
        else code.textContent = inline[1]!;
        result.append(code);
        text = text.slice(inline.index + inline[0].length);
        continue;
      }
      if (!match) {
        result.append(node("span", text));
        break;
      }
      if (match.index) result.append(node("span", text.slice(0, match.index)));
      const code = node("code");
      code.append(
        fileLink(match.file, match.file, editLine(match.file, phaseId)),
      );
      result.append(code);
      text = text.slice(match.index + match.file.length);
    }
    return result;
  }
  let finishing = false;
  let checkpointRetry: (() => unknown) | undefined;
  async function finish(completionMessage = "Observed behavior verified.") {
    if (missing() || completed.has(phase().id) || finishing || checkpointRetry)
      return;
    // Unmanaged legacy demos retain their original local progression. Managed
    // projects obtain the transition from the server's LangGraph workflow.
    let transition: WorkflowResult["flow"];
    if (info?.workspace?.enabled) {
      finishing = true;
      try {
        const { value: result } = await json<WorkflowResult>(
          "/tutorial-workspace",
          {
            action: "checkpoint",
            phaseId: phase().id,
            sessionId: info.sessionId,
          },
        );
        if (!result.ok) throw new Error(result.message);
        if (!result.flow || result.flow.phaseId !== phase().id)
          throw new Error(
            "The tutorial returned no lesson transition. Reload and retry saving progress.",
          );
        transition = result.flow;
        // Completion is recorded separately from file-change history.
        checkpointRetry = undefined;
      } catch (error) {
        const message =
          "Could not save lesson progress: " +
          (error instanceof Error ? error.message : String(error));
        record("tutor", message, true);
        checkpointRetry = () => {
          checkpointRetry = undefined;
          return finish(completionMessage);
        };
        renderLesson();
        return;
      } finally {
        finishing = false;
      }
    }
    const next = phases[index + 1];
    const advance = transition
      ? transition.status === "advance"
      : next?.lesson === phase().lesson;
    if (!advance) record("tutor", "That worked. " + completionMessage);
    completed.add(phase().id);
    report("phase_completed");
    save();
    if (advance)
      move(
        transition
          ? phases.findIndex(
              (candidate) => candidate.id === transition!.nextPhaseId,
            )
          : index + 1,
      );
    else {
      if (index === phases.length - 1) report("finished");
      renderLesson();
    }
  }
  function move(next: number) {
    if (finishing) return;
    checkpointRetry = undefined;
    index = Math.max(0, Math.min(phases.length - 1, next));
    ready = false;
    checkedPhase = "";
    checkMessage = "";
    quizWrong = false;
    observation = undefined;
    entryState = info?.state
      ? JSON.parse(JSON.stringify(info.state))
      : undefined;
    if (phase().id === "scenario" && fresh && entryState) {
      entryState.inventory = { ...entryState.inventory, ...inventoryOf() };
    }
    catalogReads = 0;
    lastCatalog = "";
    orderIds = [];
    rejectionSeen = false;
    save();
    renderLesson();
    void checkFiles();
  }
  function renderQuestion() {
    if (!observation) return;
    const panel = node("section", "", "notice");
    panel.id = "inventory-question";
    panel.append(
      node(
        "p",
        "Dark Roast API stock: " +
          observation.before +
          " → " +
          observation.after +
          " after buying " +
          observation.quantity +
          ".",
      ),
      node("p", "Does accepting an order also subtract stock?"),
    );
    const reduced =
      observation.after === observation.before - observation.quantity;
    if (quizWrong) {
      const explanation = reduced
        ? "Stock decreased because your current handler already subtracts the purchased quantities."
        : "The order succeeded, but stock stayed the same. Returning a confirmation and changing context are separate operations. Your handler must explicitly subtract the purchased quantities.";
      const feedback = node("p", explanation);
      feedback.setAttribute("role", "status");
      panel.append(
        feedback,
        button("Try again", () => {
          record("you", "Let me try again.");
          quizWrong = false;
          save();
          renderLesson();
        }),
      );
    } else {
      for (const [label, answer] of [
        ["Yes, stock decreased", true],
        ["No, stock stayed the same", false],
      ] as const) {
        panel.append(
          button(label, () => {
            record("you", label);
            if (answer !== reduced) {
              quizWrong = true;
              record(
                "tutor",
                reduced
                  ? "Stock decreased because your handler already subtracts the purchased quantities."
                  : "The order succeeded, but stock stayed the same. A confirmation does not change context. The handler must explicitly subtract the purchased quantities.",
              );
              save();
              renderLesson();
            } else finish();
          }),
        );
      }
    }
    byId("lesson").append(panel);
  }
  function bubble(role: "you" | "tutor", text = "", phaseId = phase().id) {
    const result = node(
      "article",
      "",
      "chat-turn " + (role === "you" ? "learner-turn" : "tutor-turn"),
    );
    result.dataset.phase = phaseId;
    result.append(
      node(
        "div",
        role === "you" ? "You" : "Milo · your Counterfact tutor",
        "speaker",
      ),
    );
    if (text) result.append(fileText("p", text, phaseId));
    return result;
  }
  function renderDiff(change: FileChange, key: string) {
    const details = node("details", "", "file-diff") as HTMLDetailsElement;
    details.dataset.diff = key;
    details.open = diffStates[key] ?? true;
    details.ontoggle = () => {
      if (diffStates[key] !== details.open) {
        diffStates[key] = details.open;
        save();
      }
    };
    details.append(node("summary", change.file));
    const before = change.before.split("\n"),
      after = change.after.split("\n");
    if (before.at(-1) === "") before.pop();
    if (after.at(-1) === "") after.pop();
    const rows: { kind: "context" | "remove" | "add"; text: string }[] = [];
    let prefix = 0;
    while (
      prefix < before.length &&
      prefix < after.length &&
      before[prefix] === after[prefix]
    ) {
      rows.push({ kind: "context", text: before[prefix]! });
      prefix++;
    }
    details.append(
      fileLink(
        change.file,
        "Open file",
        Math.min(prefix + 1, Math.max(1, after.length)),
      ),
    );
    let oldEnd = before.length,
      newEnd = after.length;
    while (
      oldEnd > prefix &&
      newEnd > prefix &&
      before[oldEnd - 1] === after[newEnd - 1]
    ) {
      oldEnd--;
      newEnd--;
    }
    const oldLines = before.slice(prefix, oldEnd),
      newLines = after.slice(prefix, newEnd);
    if (oldLines.length * newLines.length <= 250000) {
      const lengths = Array.from(
        { length: oldLines.length + 1 },
        () => new Uint32Array(newLines.length + 1),
      );
      for (let i = oldLines.length - 1; i >= 0; i--)
        for (let j = newLines.length - 1; j >= 0; j--)
          lengths[i]![j] =
            oldLines[i] === newLines[j]
              ? lengths[i + 1]![j + 1]! + 1
              : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
      let i = 0,
        j = 0;
      while (i < oldLines.length || j < newLines.length) {
        if (
          i < oldLines.length &&
          j < newLines.length &&
          oldLines[i] === newLines[j]
        ) {
          rows.push({ kind: "context", text: oldLines[i++]! });
          j++;
        } else if (
          i < oldLines.length &&
          (j === newLines.length || lengths[i + 1]![j]! >= lengths[i]![j + 1]!)
        )
          rows.push({ kind: "remove", text: oldLines[i++]! });
        else rows.push({ kind: "add", text: newLines[j++]! });
      }
    } else {
      for (const text of oldLines) rows.push({ kind: "remove", text });
      for (const text of newLines) rows.push({ kind: "add", text });
    }
    for (const text of before.slice(oldEnd))
      rows.push({ kind: "context", text });
    const pre = node("pre");
    const code = node("code");
    pre.replaceChildren(code);
    let omitted = false;
    rows.forEach((row, index) => {
      const nearEdit = rows
        .slice(Math.max(0, index - 3), index + 4)
        .some((candidate) => candidate.kind !== "context");
      if (!nearEdit) {
        if (!omitted)
          code.append(node("span", "  …\n", "diff-line diff-context"));
        omitted = true;
        return;
      }
      omitted = false;
      code.append(
        node(
          "span",
          (row.kind === "add" ? "+ " : row.kind === "remove" ? "- " : "  ") +
            row.text +
            "\n",
          "diff-line diff-" + row.kind,
        ),
      );
    });
    details.append(pre);
    return details;
  }
  function renderExchange(exchange: HttpExchange, openHints: Set<string>) {
    const details = node("details", "", "http-exchange") as HTMLDetailsElement;
    details.dataset.hint = "http:" + exchange.id;
    details.open = openHints.has(details.dataset.hint);
    const path = new URL(exchange.url).pathname;
    details.append(
      node(
        "summary",
        "HTTP · " +
          exchange.method +
          " " +
          path +
          " → " +
          (exchange.pending ? "waiting" : (exchange.status ?? "no response")),
      ),
    );
    if (exchange.reason) details.append(node("p", exchange.reason));
    details.append(
      fileLink(
        exchange.handler,
        "Handler: " + exchange.handler,
        editLine(exchange.handler, "explore"),
      ),
    );
    const headers = (values: Record<string, string> = {}) =>
      Object.entries(values)
        .map(([name, value]) => name + ": " + value)
        .join("\n");
    const body = (value: unknown) =>
      value === undefined
        ? "(no body)"
        : typeof value === "string"
          ? value
          : JSON.stringify(value, null, 2);
    details.append(
      node("h4", "Request"),
      node(
        "pre",
        exchange.method +
          " " +
          exchange.url +
          "\n" +
          headers(exchange.requestHeaders) +
          "\n\n" +
          body(exchange.requestBody),
      ),
    );
    details.append(
      node(
        "p",
        "Request headers shown are those explicitly set by the shop.",
        "http-note",
      ),
    );
    details.append(node("h4", "Response"));
    if (exchange.status !== undefined)
      details.append(
        node(
          "pre",
          "HTTP " +
            exchange.status +
            "\n\n" +
            (exchange.responseText ??
              (exchange.responseBody === undefined
                ? "(response body not recorded)"
                : body(exchange.responseBody))),
        ),
      );
    else
      details.append(
        node(
          "p",
          exchange.pending
            ? "Waiting for the API response…"
            : "No HTTP response was recorded. The server may still have received the request.",
        ),
      );
    if (
      exchange.responseHeaders &&
      Object.keys(exchange.responseHeaders).length
    ) {
      const responseHeaders = node(
        "details",
        "",
        "http-headers",
      ) as HTMLDetailsElement;
      responseHeaders.dataset.hint = "http-headers:" + exchange.id;
      responseHeaders.open = openHints.has(responseHeaders.dataset.hint);
      responseHeaders.append(
        node("summary", "Response headers"),
        node("pre", headers(exchange.responseHeaders)),
      );
      details.append(responseHeaders);
    }
    if (exchange.error) details.append(node("p", exchange.error, "error"));
    return details;
  }
  function turnBubble(turn: Turn, openHints: Set<string>) {
    const result = bubble(turn.role, turn.text, turn.phaseId);
    const turnPhase =
      phases.find((candidate) => candidate.id === turn.phaseId) ?? phase();
    result.dataset.hintText =
      turn.hint ??
      (turn.verificationRevision ? turnPhase.verificationHint : undefined) ??
      turnPhase.hint ??
      turnPhase.instruction;
    if (turn.waitForAction || turn.verificationRevision) {
      result.dataset.action = "true";
      if (turn.phaseId === phase().id && !completed.has(turn.phaseId))
        result.dataset.waitForAction = "true";
    }
    if (turn.command !== undefined) result.append(node("pre", turn.command));
    for (const file of turn.files ?? [])
      result.append(
        renderDiff(file, "turn:" + turns.indexOf(turn) + ":" + file.file),
      );
    for (const exchange of turn.exchanges ?? [])
      result.append(renderExchange(exchange, openHints));
    return result;
  }
  let renderedConversation = "";
  function messageParts(text: string) {
    const parts: string[] = [];
    let part = "";
    for (const sentence of text.split(/(?<=[.!?])\s+(?=[A-Z“‘])/u)) {
      if (part && (part + " " + sentence).split(/\s+/u).length > 45) {
        parts.push(part);
        part = "";
      }
      part += (part ? " " : "") + sentence;
    }
    if (part) parts.push(part);
    return parts;
  }
  function paceConversation() {
    const lesson = byId("lesson");
    const visible: HTMLElement[] = [];
    let waiting = false;
    let waitingForAction = false;
    const elements = Array.from(lesson.children) as HTMLElement[];
    messages: for (const [elementIndex, element] of elements.entries()) {
      if (!element.className.split(" ").includes("tutor-turn")) {
        visible.push(element);
        continue;
      }
      const contents = Array.from(element.children).slice(1) as HTMLElement[];
      const paragraphs = contents.filter((child) => child.tagName === "P");
      const words = paragraphs
        .map((child) => child.textContent ?? "")
        .join(" ")
        .split(/\s+/u).length;
      const phaseId = element.dataset.phase ?? phase().id;
      const phaseIndex = phases.findIndex(
        (candidate) => candidate.id === phaseId,
      );
      const historical =
        phaseIndex >= 0 && (phaseIndex < index || completed.has(phaseId));
      const key = JSON.stringify([
        phaseId,
        paragraphs[0]?.dataset.prose ?? paragraphs[0]?.textContent,
      ]);
      const groups: HTMLElement[][] = [];
      let group: HTMLElement[] = [];
      let hasParagraph = false;
      const action = element.dataset.action === "true";
      for (const child of words > 60 && !action ? contents : []) {
        if (child.tagName !== "P") {
          group.push(child);
          continue;
        }
        const text = child.dataset.prose ?? child.textContent ?? "";
        const parts = messageParts(text);
        for (const part of parts) {
          if (hasParagraph) {
            groups.push(group);
            group = [];
          }
          group.push(parts.length === 1 ? child : fileText("p", part, phaseId));
          hasParagraph = true;
        }
      }
      if (words <= 60 || action) group = contents;
      if (group.length) groups.push(group);
      const acknowledged = revealedMessages[key] ?? 1;
      const revealed = historical
        ? groups.length
        : Math.min(groups.length, acknowledged);
      for (const [partIndex, children] of groups.slice(0, revealed).entries()) {
        const id = JSON.stringify([key, partIndex]);
        if (historical) displayedMessages.add(id);
        if (!displayedMessages.has(id)) {
          if (!messageAllowance) {
            const previous = visible
              .slice()
              .reverse()
              .find((candidate) =>
                candidate.className.split(" ").includes("tutor-turn"),
              );
            waitingForAction = previous?.dataset.waitForAction === "true";
            if (!waitingForAction)
              previous?.append(button("Okay", () => renderLesson()));
            waiting = true;
            break messages;
          }
          messageAllowance--;
          displayedMessages.add(id);
          if (!reducedMotion()) typing = { id, shown: 0 };
        }
        const message = bubble("tutor", "", phaseId);
        message.dataset.messageId = id;
        message.dataset.pacingKey = key;
        message.dataset.pacingPart = String(partIndex);
        if (
          element.dataset.waitForAction === "true" ||
          children.some((child) => child.dataset.waitForAction === "true")
        )
          message.dataset.waitForAction = "true";
        message.dataset.hintText =
          element.dataset.hintText ?? phase().hint ?? phase().instruction;
        if (partIndex === 0) message.id = element.id;
        if (partIndex === groups.length - 1 && element.dataset.proposal)
          message.dataset.proposal = element.dataset.proposal;
        message.append(...children);
        visible.push(message);
      }
      const nextMessage = elements
        .slice(elementIndex + 1)
        .find((candidate) =>
          candidate.className
            .split(" ")
            .some((name) => name === "tutor-turn" || name === "learner-turn"),
        );
      if (
        !historical &&
        (revealed < groups.length ||
          (acknowledged <= groups.length &&
            nextMessage?.className.split(" ").includes("tutor-turn")))
      ) {
        waitingForAction = visible.at(-1)!.dataset.waitForAction === "true";
        if (!waitingForAction)
          visible.at(-1)!.append(
            button("Okay", () => {
              revealedMessages[key] = revealed + 1;
              save();
              renderLesson();
            }),
          );
        waiting = true;
        break;
      }
    }
    lesson.replaceChildren(...visible);
    if (waiting) {
      (byId("continue") as HTMLButtonElement).hidden = true;
      if (!waitingForAction) (byId("hint") as HTMLButtonElement).hidden = true;
    }
  }
  function hasBaseline(state: Info["state"] | undefined) {
    if (
      !state ||
      !Array.isArray(state.catalog) ||
      !state.inventory ||
      baselineProducts.length === 0 ||
      state.catalog.length !== baselineProducts.length ||
      Object.keys(state.inventory).length !== baselineProducts.length
    )
      return false;
    const catalog = state.catalog;
    const inventory = state.inventory;
    return baselineProducts.every((expected) => {
      const actual = catalog.find((coffee) => coffee?.id === expected.id);
      return (
        actual &&
        ["id", "name", "description", "price"].every(
          (key) => actual[key] === expected[key as keyof typeof expected],
        ) &&
        inventory[expected.id] === expected.stock
      );
    });
  }
  function baselineRecovery(state: Info["state"]) {
    const catalog = Array.isArray(state.catalog) ? state.catalog : [];
    const changed = baselineProducts
      .filter((expected) => {
        const actual = catalog.find((coffee) => coffee?.id === expected.id);
        return (
          !actual ||
          ["id", "name", "description", "price"].some(
            (key) => actual[key] !== expected[key as keyof typeof expected],
          )
        );
      })
      .map((coffee) => coffee.name);
    const stocks = baselineProducts
      .filter((coffee) => state.inventory?.[coffee.id] !== coffee.stock)
      .map((coffee) => coffee.name + ": " + coffee.stock);
    const extraCatalog =
      catalog.length !== baselineProducts.length
        ? "The catalog must contain exactly the three baseline coffees. "
        : "";
    const extraInventory = Object.keys(state.inventory ?? {}).some(
      (id) => !baselineProducts.some((coffee) => coffee.id === id),
    )
      ? "Inventory still contains extra entries. "
      : "";
    return (
      "The running shop does not yet match reset’s baseline. " +
      (changed.length
        ? "Catalog entries still differ for " + changed.join(", ") + ". "
        : "") +
      (stocks.length ? "Expected stock: " + stocks.join(", ") + ". " : "") +
      extraCatalog +
      extraInventory +
      "At the terminal’s ⬣> prompt, run `reset` through the `.scenario` command."
    );
  }
  function practiceSetupHint() {
    const catalog = info?.state.catalog;
    if (!Array.isArray(catalog) || catalog.length === 0)
      return phase().hint ?? phase().instruction;
    const practiceIndex = catalog.findIndex(
      (coffee) => coffee?.id === "practice-coffee",
    );
    const keep = practiceIndex < 0 ? 0 : practiceIndex;
    const extras = catalog
      .map((_, index) => index)
      .filter((index) => index !== keep)
      .reverse();
    if (extras.length)
      return (
        "Your running catalog has " +
        catalog.length +
        " entries; this exercise needs one. Keep the coffee at zero-based index " +
        keep +
        ". In the REPL, use the `splice` method on `context.catalog` to remove the extra entries at indices " +
        extras.join(", ") +
        " in that order. For each removal, pass its index and a count of 1. Then click Refresh products."
      );
    const coffee = catalog[0];
    if (
      practiceIndex < 0 ||
      typeof coffee?.name !== "string" ||
      typeof coffee?.description !== "string" ||
      !Number.isInteger(coffee?.price) ||
      coffee.price < 500 ||
      coffee.price > 2500
    )
      return "A coffee already exists in `context.catalog`; edit that entry instead of appending another. At the REPL, update the object at index 0: its `id` should be practice-coffee, `name` Practice Coffee, `description` Chocolate and caramel, and numeric `price` 1400. Then click Refresh products.";
    if (info.state.inventory?.["practice-coffee"] !== 5)
      return "The practice coffee already exists. In the REPL, assign 5 to the practice-coffee entry in `context.inventory`, then click Refresh products.";
    return "The practice coffee and its stock are already in the running context. Click Refresh products to observe them through the shop.";
  }
  function currentHint() {
    const prompt = (Array.from(byId("lesson").children) as HTMLElement[])
      .filter((element) => element.className.split(" ").includes("tutor-turn"))
      .at(-1);
    const quiz =
      phase().id === "observe" && observation && !completed.has("observe");
    if (!prompt || (!quiz && prompt.dataset.waitForAction !== "true")) return;
    let text = prompt.dataset.hintText ?? phase().hint ?? phase().instruction;
    if (checkpointRetry)
      text =
        "Your API experiment succeeded, but saving its lesson checkpoint failed. Click Retry saving progress in the conversation to save that checkpoint without repeating the order.";
    else if (phase().id === "seed" && ready && !hasBaseline(info.state))
      text = baselineRecovery(info.state);
    else if (
      phase().id === "seed" &&
      ready &&
      hasBaseline(info.state) &&
      !hasBaseline(entryState)
    )
      return;
    else if (phase().id === "context-repl")
      text =
        !ready && checkedPhase === "context-repl"
          ? phases.find((candidate) => candidate.id === "connect")!.hint!
          : practiceSetupHint();
    else if (quiz)
      text = quizWrong
        ? "Click Try again below the inventory question. Compare the stock before and after the order: unchanged stock means the order did not subtract it; a decrease by the purchased quantity means it did."
        : "Compare the before and after stock counts shown with the question. Choose No if stock stayed the same, or Yes if it fell by the purchased quantity.";
    return {
      prompt,
      text,
      key: JSON.stringify([prompt.dataset.messageId, text]),
    };
  }
  function renderHint() {
    const control = byId("hint") as HTMLButtonElement;
    const hint = currentHint();
    control.hidden = !hint || !!typing;
    if (hint) {
      let wasOpen = false;
      for (const [key, previous] of revealedHints)
        if (
          previous.messageId === hint.prompt.dataset.messageId &&
          key !== hint.key
        ) {
          revealedHints.delete(key);
          wasOpen = true;
        }
      if (wasOpen)
        revealedHints.set(hint.key, {
          messageId: hint.prompt.dataset.messageId!,
          text: hint.text,
        });
    }
    control.textContent =
      hint && revealedHints.has(hint.key) ? "Hide hint" : "Hint";
    for (const message of Array.from(
      byId("lesson").children,
    ) as HTMLElement[]) {
      for (const revealed of revealedHints.values()) {
        if (revealed.messageId !== message.dataset.messageId) continue;
        const content = node("aside", "", "notice lesson-hint");
        content.append(
          node("strong", "Hint"),
          fileText("p", revealed.text, message.dataset.phase),
        );
        message.append(content);
      }
    }
  }
  function acknowledgeVisibleMessages() {
    messageAllowance = 1;
    for (const element of Array.from(
      byId("lesson").children,
    ) as HTMLElement[]) {
      const key = element.dataset.pacingKey;
      if (key)
        revealedMessages[key] = Math.max(
          revealedMessages[key] ?? 1,
          Number(element.dataset.pacingPart) + 2,
        );
    }
    save();
  }
  function scrollToLatestMessage() {
    paceConversation();
    renderHint();
    const lesson = byId("lesson");
    const content = lesson.textContent ?? "";
    const end = node("div", "", "conversation-end");
    end.id = "conversation-end";
    end.setAttribute("aria-hidden", "true");
    lesson.append(end);
    if (content !== renderedConversation)
      end.scrollIntoView?.({
        block: "end",
        behavior: reducedMotion() ? "auto" : "smooth",
      });
    renderedConversation = content;
    save();
    animateTyping();
  }
  function animateTyping() {
    if (typingTimer) clearTimeout(typingTimer);
    if (!typing) return;
    const message = (Array.from(byId("lesson").children) as HTMLElement[]).find(
      (candidate) => candidate.dataset.messageId === typing!.id,
    );
    if (!message) return;
    const text: { node: Text; full: string }[] = [];
    for (const paragraph of message.querySelectorAll("p,h2")) {
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      for (
        let current = walker.nextNode();
        current;
        current = walker.nextNode()
      )
        text.push({ node: current as Text, full: current.textContent ?? "" });
    }
    const total = text.reduce((length, item) => length + item.full.length, 0);
    if (typing.shown >= total || reducedMotion()) {
      typing = undefined;
      return;
    }
    const controls = Array.from(message.querySelectorAll("button"));
    for (const control of controls) control.disabled = true;
    message.dataset.typing = "true";
    message.setAttribute("aria-busy", "true");
    (byId("continue") as HTMLButtonElement).hidden = true;
    (byId("hint") as HTMLButtonElement).hidden = true;
    const draw = () => {
      let remaining = typing!.shown;
      for (const item of text) {
        item.node.textContent = item.full.slice(0, Math.max(0, remaining));
        remaining -= item.full.length;
      }
    };
    draw();
    const tick = () => {
      if (!typing) return;
      typing.shown = Math.min(total, typing.shown + 4);
      draw();
      if (typing.shown % 40 === 0)
        byId("conversation-end")?.scrollIntoView?.({
          block: "end",
          behavior: "smooth",
        });
      if (typing.shown < total) typingTimer = setTimeout(tick, 16);
      else {
        typing = undefined;
        renderLesson();
      }
    };
    typingTimer = setTimeout(tick, 100);
  }
  function renderLesson() {
    const current = phase(),
      lesson = byId("lesson");
    for (const diff of lesson.querySelectorAll<HTMLDetailsElement>(
      "details.file-diff",
    ))
      if (diff.dataset.diff) diffStates[diff.dataset.diff] = diff.open;
    const openHints = new Set(
      Array.from(lesson.querySelectorAll<HTMLDetailsElement>("details[open]"))
        .map((hint) => hint.dataset.hint)
        .filter((hint): hint is string => typeof hint === "string"),
    );
    lesson.replaceChildren();
    const welcome = bubble("tutor", "", "welcome");
    const demoFolder = node("p", "Open this demo folder in your editor: ");
    demoFolder.dataset.prose =
      "Open this demo folder in your editor: " + projectPath;
    if (!folderOpened) demoFolder.dataset.waitForAction = "true";
    demoFolder.append(fileLink("", projectPath), node("span", "."));
    if (!folderOpened)
      demoFolder.append(
        button("Folder is open", () => {
          folderOpened = true;
          renderLesson();
        }),
      );
    welcome.append(
      node("h2", "Hi, I’m Milo."),
      node(
        "p",
        "I run this little coffee shop. Let’s build its local API together, one behavior at a time.",
      ),
      ...(walkthroughVersion >= 4
        ? [
            fileText(
              "p",
              "The shop uses `GET /shop/products` to load coffee and `POST /shop/orders` to place an order. Counterfact governs these responses.",
              "welcome",
            ),
          ]
        : []),
      ...(walkthroughVersion < 4 ? [demoFolder] : []),
    );
    lesson.append(welcome);
    if (resumeCheckpoint !== undefined) {
      const checkpoint = resumeCheckpoint;
      const next = phases.find((candidate) => candidate.lesson > checkpoint);
      const handoff = bubble(
        "tutor",
        "Welcome back. This project has " +
          checkpoint +
          " completed lessons. Your saved code is still here. " +
          (next
            ? "Your next lesson is " + next.lesson + ": " + next.title + "."
            : "You’ve completed the walkthrough. Your API is available for more experiments."),
      );
      handoff.dataset.hintText =
        "Click Resume this project to continue from the saved lesson checkpoint. Your files will be kept and the shop will start with fresh cart and request observations.";
      handoff.dataset.action = "true";
      handoff.dataset.waitForAction = "true";
      handoff.append(
        node(
          "p",
          "This API session starts with fresh cart, request, and quiz observations. Resuming does not edit your files or run a scenario.",
        ),
        button("Resume this project", async () => {
          completed = new Set(
            phases
              .filter((candidate) => candidate.lesson <= checkpoint)
              .map((candidate) => candidate.id),
          );
          index = next ? phases.indexOf(next) : phases.length - 1;
          resumeCheckpoint = undefined;
          entryState = JSON.parse(JSON.stringify(info.state));
          record("you", "Resume this project.");
          renderLesson();
          renderShop();
          await checkFiles();
        }),
      );
      lesson.append(handoff);
      (byId("continue") as HTMLButtonElement).hidden = true;
      (byId("hint") as HTMLButtonElement).hidden = true;
      scrollToLatestMessage();
      return;
    }
    for (const [phaseIndex, revealed] of phases.entries()) {
      if (phaseIndex > index) break;
      const active = revealed.id === current.id;
      const prepared = !!info?.workspace?.prepared.includes(revealed.id);
      const finished = completed.has(revealed.id);
      if (
        phaseIndex === 0 ||
        phases[phaseIndex - 1]!.lesson !== revealed.lesson
      ) {
        const heading = node("header", "", "lesson-heading");
        heading.append(
          node("div", "Lesson " + revealed.lesson, "eyebrow"),
          node("h2", revealed.title),
        );
        lesson.append(heading);
      }
      const introduction = bubble("tutor", "", revealed.id);
      if (active) introduction.id = "current-turn";
      if (revealed.introduction)
        lesson.append(bubble("tutor", revealed.introduction, revealed.id));
      const explanation = fileText("p", revealed.explanation, revealed.id);
      if (revealed.id === "explore") {
        const link = node("a", origin) as HTMLAnchorElement;
        link.href = origin;
        explanation.append(link, node("span", "."));
      }
      if (revealed.id === "explore") {
        introduction.append(explanation);
        lesson.append(introduction);
      }
      if (revealed.id === "explore")
        lesson.append(
          bubble(
            "tutor",
            "Before we inspect the handler, here’s where this API starts. OpenAPI, formerly Swagger, is a format for describing an HTTP API: its endpoints, the requests they accept, and the responses they return. A schema describes the shape of data, including its properties, types, and limits. Counterfact includes a coffee-shop API description with this walkthrough and saved a copy as openapi.yaml in your demo folder. It used that file to generate your starting handlers and TypeScript types.",
            revealed.id,
          ),
        );
      const phaseTurns = turns.filter(
        (turn) =>
          turn.phaseId === revealed.id &&
          !(turn.role === "you" && turn.text === "Apply changes.") &&
          !(
            turn.role === "tutor" &&
            [
              "I’ve added the supporting code. Now it’s your turn.",
              "We’ll continue from your saved lesson progress.",
              "Your completed lessons are preserved. Keep experimenting with your API.",
            ].includes(turn.text)
          ),
      );
      const appliedEdit =
        phaseTurns.find(
          (turn) => turn.role === "tutor" && turn.files?.length,
        ) ??
        info?.workspace?.changes?.find(
          (edit) => edit.actor === "milo" && edit.phaseId === revealed.id,
        );
      if (revealed.preparation) {
        const proposal = bubble("tutor", "", revealed.id);
        proposal.append(
          ...(revealed.approval ? [] : [explanation]),
          fileText(
            "p",
            (revealed.approval ? "" : "Here’s what I’d like to change: ") +
              revealed.preparation,
            revealed.id,
          ),
        );
        const preview = proposals.get(revealed.id);
        const applied = prepared || !!appliedEdit;
        proposal.dataset.hintText = preview?.error
          ? "Click Retry preview to regenerate the proposed diff. This only prepares a preview; your files stay unchanged until you approve it."
          : "Expand the proposed file diff and review the highlighted additions and removals. Click Apply changes to approve exactly those edits.";
        proposal.dataset.proposal = revealed.id;
        proposal.dataset.action = "true";
        if (active && !applied && !finished && info?.workspace?.enabled)
          proposal.dataset.waitForAction = "true";
        proposal.append(
          node(
            "p",
            applied
              ? "Changes applied."
              : (revealed.approval ??
                  "This diff shows the edits I’m proposing: green lines are additions and red lines are removals. Click Apply changes to save them."),
            applied ? "step-complete" : "",
          ),
        );
        for (const file of appliedEdit?.files ?? preview?.files ?? [])
          proposal.append(
            renderDiff(file, "proposal:" + revealed.id + ":" + file.file),
          );
        if (
          active &&
          !applied &&
          !finished &&
          info?.workspace?.enabled &&
          !missing()
        ) {
          if (preview?.error)
            proposal.append(node("p", preview.error, "error"));
          if (preview?.revision && preview.files?.length) {
            const approve = button(
              preview.applying ? "Applying changes…" : "Apply changes",
              async () => {
                preview.applying = true;
                renderLesson();
                try {
                  const { value: result } = await json<{
                    ok: boolean;
                    message: string;
                    changes?: EditEvent[];
                  }>("/tutorial-workspace", {
                    action: "prepare",
                    phaseId: revealed.id,
                    sessionId: info.sessionId,
                    revision: preview.revision,
                  });
                  if (result.ok) {
                    if (!info.workspace!.prepared.includes(revealed.id))
                      info.workspace!.prepared.push(revealed.id);
                    checkedPhase = "";
                    syncChanges(result.changes);
                  } else {
                    await loadProposal(revealed.id, true);
                    proposals.get(revealed.id)!.error =
                      "I couldn’t apply that edit: " + result.message;
                  }
                } catch (error) {
                  preview.error =
                    "I couldn’t apply that edit: " +
                    (error instanceof Error ? error.message : String(error));
                } finally {
                  preview.applying = false;
                }
                renderLesson();
                await checkFiles();
              },
            );
            approve.disabled = preview.applying === true;
            proposal.append(approve);
          } else if (preview?.error)
            proposal.append(
              button("Retry preview", () => loadProposal(revealed.id, true)),
            );
          else proposal.append(node("p", "Preparing the proposed diff…"));
        }
        lesson.append(proposal);
      }
      // Preparation precedes the exercise; observations and replies follow it.
      const preparationEnd = phaseTurns.findIndex(
        (turn) => turn.role === "tutor" && turn.files?.length,
      );
      const before = !revealed.preparation
        ? []
        : preparationEnd < 0 && !prepared
          ? phaseTurns
          : phaseTurns.slice(0, preparationEnd + 1);
      for (const turn of before)
        if (!(turn.role === "tutor" && turn.files?.length))
          lesson.append(turnBubble(turn, openHints));
      if (
        revealed.preparation &&
        !prepared &&
        !finished &&
        info?.workspace?.enabled
      )
        continue;
      const exercise = bubble("tutor", "", revealed.id);
      exercise.dataset.action = "true";
      exercise.dataset.hintText = revealed.hint ?? revealed.instruction;
      if (active && !finished && !ready)
        exercise.dataset.waitForAction = "true";
      if (active && !finished && !revealed.check)
        exercise.dataset.waitForAction = "true";
      if (!revealed.preparation && revealed.id !== "explore")
        exercise.append(explanation);
      if (revealed.id === "explore" && walkthroughVersion >= 4) {
        const folderPrompt = bubble("tutor", "", revealed.id);
        folderPrompt.dataset.hintText =
          "Click the demo-folder link to open the project in VSCode, or open that folder in your preferred editor. Once it is open, click Folder is open.";
        folderPrompt.dataset.action = "true";
        if (active && !finished && !folderOpened)
          folderPrompt.dataset.waitForAction = "true";
        if (finished) {
          const folder = node("p", "Demo folder: ");
          folder.append(fileLink("", projectPath));
          folderPrompt.append(folder);
        } else folderPrompt.append(demoFolder);
        lesson.append(folderPrompt);
      }
      exercise.append(fileText("p", revealed.instruction, revealed.id));
      lesson.append(exercise);
      for (const turn of phaseTurns.slice(before.length))
        if (!(turn.role === "tutor" && turn.files?.length))
          lesson.append(turnBubble(turn, openHints));
      if (active && current.id === "observe" && !finished) renderQuestion();
      if (active && finished) {
        const done = node("p", "✓ Lesson complete", "step-complete");
        done.id = "step-completion";
        lesson.append(done);
        if (index === phases.length - 1) {
          const goodbye = bubble(
            "tutor",
            "We’ve built the shop’s behavior together. Your API now supports more experiments with products and failure conditions. Our conversation stays available as a reference.",
          );
          goodbye.append(
            node(
              "p",
              "Restarting keeps your code and runs startup again. Your saved lesson progress remains available through Resume this project, with fresh cart, request, and quiz observations.",
            ),
            node("p", "To restart, run this from " + restartDirectory + ":"),
            node(
              "pre",
              restartCommand + " --port " + (window.location.port || "3100"),
            ),
          );
          lesson.append(goodbye);
        }
      }
    }
    if (checkpointRetry)
      lesson.append(button("Retry saving progress", checkpointRetry));
    const next = phases[index + 1];
    const nextButton = byId("continue") as HTMLButtonElement;
    nextButton.textContent = next
      ? "Next Lesson: " + next.title
      : "Walkthrough complete";
    nextButton.hidden = !completed.has(current.id) || !next;
    renderStatus();
    scrollToLatestMessage();
  }
  function renderStatus() {
    byId("save-check").textContent = checkMessage;
  }
  function validProducts(value: unknown): value is Product[] {
    return (
      Array.isArray(value) &&
      new Set(value.map((product) => product?.id)).size === value.length &&
      value.every(
        (product) =>
          product &&
          typeof product.id === "string" &&
          product.id.length > 0 &&
          typeof product.name === "string" &&
          typeof product.description === "string" &&
          Number.isSafeInteger(product.price) &&
          product.price >= 0 &&
          Number.isSafeInteger(product.stock) &&
          product.stock >= 0,
      )
    );
  }
  function renderShop() {
    byId("products").replaceChildren();
    for (const [productIndex, product] of products.entries()) {
      const card = node("article", "", "card");
      card.dataset.productId = product.id;
      const bag = node(
        "div",
        "",
        "bag " + ["", "dark-roast", "decaf"][productIndex % 3],
      );
      bag.append(node("div", product.name, "bag-label"));
      const available = Math.max(
        0,
        product.stock - (cart.get(product.id) ?? 0),
      );
      card.append(
        bag,
        node("h3", product.name),
        node("p", product.description),
        node("div", money(product.price) + " / 250g", "price"),
        node(
          "div",
          !fresh
            ? "Availability temporarily unavailable"
            : product.stock === 0
              ? "Sold out"
              : available +
                (cart.has(product.id) ? " more" : "") +
                (available === 1 ? " bag available" : " bags available"),
          "stock",
        ),
      );
      const add = button("Add to cart", () => {
        const quantity = (cart.get(product.id) ?? 0) + 1;
        cart.set(product.id, quantity);
        uiAction(
          "Added " +
            product.name +
            " to the cart (quantity: " +
            quantity +
            ").",
        );
        renderShop();
      });
      add.disabled =
        busy || resumeCheckpoint !== undefined || !fresh || available === 0;
      card.append(add);
      byId("products").append(card);
    }
    if (!products.length)
      byId("products").append(
        node(
          "p",
          fresh
            ? "No coffees are available right now."
            : "Refresh products to load the catalog.",
        ),
      );
    byId("cart").replaceChildren();
    let total = 0;
    for (const [id, quantity] of cart) {
      const product = products.find((candidate) => candidate.id === id);
      const row = node("div", "", "cart-row");
      row.append(node("span", (product?.name ?? id) + " × " + quantity));
      const actions = node("span");
      for (const [label, delta] of [
        ["−", -1],
        ["+", 1],
      ] as const) {
        const control = button(label, () => {
          const value = quantity + delta;
          if (value <= 0) cart.delete(id);
          else cart.set(id, value);
          uiAction(
            value <= 0
              ? "Removed " +
                  (product?.name ?? id) +
                  " from the cart (quantity: 0)."
              : "Changed " +
                  (product?.name ?? id) +
                  " in the cart from " +
                  quantity +
                  " to " +
                  value +
                  ".",
          );
          renderShop();
        });
        control.disabled =
          busy ||
          (delta > 0 && (!fresh || !product || quantity >= product.stock));
        control.setAttribute(
          "aria-label",
          (delta < 0 ? "Decrease " : "Increase ") +
            (product?.name ?? id) +
            " quantity",
        );
        actions.append(control);
      }
      actions.append(
        button("Remove", () => {
          cart.delete(id);
          uiAction(
            "Removed " +
              (product?.name ?? id) +
              " from the cart (" +
              quantity +
              " removed).",
          );
          renderShop();
        }),
      );
      row.append(actions);
      byId("cart").append(row);
      total += (product?.price ?? 0) * quantity;
    }
    if (!cart.size)
      byId("cart").append(
        node("p", "Your cart is empty. Choose a coffee above."),
      );
    byId("total").textContent = money(total);
    const checkout = byId("checkout") as HTMLButtonElement;
    checkout.disabled = busy || !fresh || !cart.size;
    checkout.textContent = failedItems ? "Try again" : "Place order";
    byId("retry-recovery").replaceChildren();
    if (
      phase().id === "retry" &&
      failedItems &&
      !equal(
        failedItems,
        [...cart].map(([productId, quantity]) => ({ productId, quantity })),
      )
    ) {
      byId("retry-recovery").append(
        node(
          "p",
          "Retry the original failed order to isolate the effect of restoring the handler.",
        ),
        button("Restore original cart", () => {
          cart = new Map(
            failedItems!.map((item) => [item.productId, item.quantity]),
          );
          uiAction(
            "Restored the original failed cart: " +
              describeItems(failedItems!) +
              ".",
          );
          renderShop();
        }),
      );
    }
    save();
  }
  function observeProducts(source: string) {
    if (resumeCheckpoint !== undefined || missing() || !fresh) return;
    const id = phase().id;
    if (id === "explore" && source === "manual") {
      report("started", phases[0]!.id);
      finish(
        "The returned products follow the shapes described in openapi.yaml." +
          (walkthroughVersion >= 5
            ? " At this point Counterfact doesn't know anything about the description field except that it's a string, so it's generating random, nonsensical strings. Let's fix that."
            : ""),
      );
    }
    if (source === "manual") {
      let nextAction: string | undefined;
      let nextHint: string | undefined;
      if (
        id === "connect" &&
        walkthroughVersion < 6 &&
        ready &&
        orderIds.length === 0
      )
        nextAction =
          "Click Add to cart on House Blend, then click Place order.";
      if (id === "decaf" && inventoryOf().decaf === 5)
        nextAction =
          "Decaf now shows 5 in the running API. Click Add to cart on Decaf, then click Place order.";
      if (id === "restock" && inventoryOf()["dark-roast"] === 5)
        nextAction =
          "Dark Roast now has 5 bags, so buying one should leave 4. Click Add to cart on Dark Roast once, then click Place order.";
      if (id === "connect")
        nextHint =
          "On the House Blend card, click Add to cart once, then click Place order in the cart.";
      if (id === "decaf")
        nextHint =
          "On the Decaf card showing 5 bags, click Add to cart once, then click Place order in the cart.";
      if (id === "restock")
        nextHint =
          "On the Dark Roast card showing 5 bags, click Add to cart once, then click Place order in the cart.";
      if (
        nextAction &&
        !turns.some((turn) => turn.phaseId === id && turn.text === nextAction)
      ) {
        record("tutor", nextAction, true, nextHint);
        renderLesson();
      }
    }
    if (
      id === "context-repl" &&
      ready &&
      source === "manual" &&
      products.length === 1 &&
      products[0]?.id === "practice-coffee" &&
      products[0]?.stock === 5 &&
      info.state.inventory?.["practice-coffee"] === 5 &&
      Array.isArray(info.state.catalog) &&
      info.state.catalog.length === 1
    )
      finish(
        "The shop read the coffee and stock you added through the REPL. Routes and the REPL share this same running context.",
      );
    if (
      ["name-example", "description-example"].includes(id) &&
      ready &&
      source === "manual"
    ) {
      if (
        expectedExamples?.length &&
        products.length > 0 &&
        products.every((product) =>
          expectedExamples!.includes(
            id === "name-example" ? product.name : product.description,
          ),
        )
      )
        finish(
          "The generated response now uses your OpenAPI " +
            (id === "name-example" ? "name example" : "description examples") +
            ". The product handler still calls `.random()`.",
        );
      else {
        record(
          "tutor",
          "The example is saved. Wait for Counterfact to reload the spec, then refresh products again to observe it.",
          true,
          "Click Refresh products again after Counterfact has reloaded the saved OpenAPI file. The response values must match your saved examples.",
        );
        renderLesson();
      }
    }
    if (id === "catalog" && ready && source === "manual") {
      const current = JSON.stringify(products);
      catalogReads = current === lastCatalog ? catalogReads + 1 : 1;
      lastCatalog = current;
      if (catalogReads >= 2) finish();
      else {
        const message =
          "The catalog is in place. Click Refresh products once more and compare the two responses in the chat.";
        record(
          "tutor",
          message,
          true,
          "Click Refresh products at the top right once more. Compare this GET response with the previous one in the chat; the three catalog entries should match.",
        );
        renderLesson();
      }
    }
    if (
      id === "rules" &&
      rejectionSeen &&
      !cart.size &&
      inventoryOf()["dark-roast"] === 3
    )
      finish();
    if (id === "sellout" && inventoryOf()["dark-roast"] === 0) finish();
    save();
    renderStatus();
  }
  async function refreshProducts(source = "manual", action?: Turn) {
    try {
      const { response, value } = await json(
        "/products",
        undefined,
        action,
        source === "order"
          ? "The shop refreshes products after the order to show the current API state."
          : undefined,
      );
      if (!response.ok || !validProducts(value))
        throw new Error(
          phase().id === "context-repl" && ready
            ? "The running catalog contains invalid coffee data or duplicate IDs. Use Hint to correct the existing catalog entries in the REPL."
            : "The products response is invalid or contains duplicate IDs. Inspect it in the chat, fix the handler or refresh again.",
        );
      if (
        !completed.has("catalog") &&
        !(phase().id === "catalog" && ready) &&
        source === "manual" &&
        cart.size
      ) {
        cart.clear();
        const message =
          "Refreshing random products clears the previous cart because product IDs and prices may change.";
        record("tutor", message);
      }
      products = value;
      fresh = true;
      if (source === "manual") renderLesson();
      renderShop();
      observeProducts(source);
      return true;
    } catch (error) {
      fresh = false;
      const message =
        error instanceof Error
          ? error.message
          : "Product request failed. Click Refresh products to retry.";
      if (source === "manual") {
        record("tutor", "The product refresh failed: " + message, true);
        renderLesson();
      }
      renderShop();
      renderStatus();
      return false;
    }
  }
  async function placeOrder() {
    if (resumeCheckpoint !== undefined || busy || !fresh || !cart.size) return;
    acknowledgeVisibleMessages();
    busy = true;
    byId("shop-notice").textContent = "";
    renderShop();
    const currentId = phase().id,
      before = inventoryOf(),
      items = [...cart].map(([productId, quantity]) => ({
        productId,
        quantity,
      }));
    try {
      await checkFiles();
      if (phase().id !== currentId) return;
      const orderAction = uiAction(
        (failedItems ? "Retried the order: " : "Placed an order: ") +
          describeItems(items) +
          ".",
      );
      const { response, value } = await json<{
        orderId?: number;
        items?: Item[];
        error?: string;
        shortages?: { requested: number; available: number }[];
      }>("/orders", { items }, orderAction);
      const original = failedItems;
      if (response.status === 201 && Number.isInteger(value?.orderId)) {
        cart.clear();
        failedItems = undefined;
        byId("shop-notice").textContent = "Thanks! Your order has been placed.";
      } else if (response.ok)
        throw new Error(
          "The confirmation has no integer orderId, but the order may have been accepted. Inspect POST /orders in the chat before retrying.",
        );
      else {
        failedItems = items;
        byId("shop-notice").textContent =
          (value?.error ?? "Order rejected") + " Your cart has been kept.";
      }
      await refreshProducts("order", orderAction);
      if (phase().id !== currentId || missing()) return;
      if (
        currentId === "orientation" &&
        response.status === 201 &&
        Number.isInteger(value?.orderId)
      ) {
        report("started", "orientation");
        finish(
          "You’ve tried the shop and seen its request and response in the conversation. Next we’ll inspect the API that produced them.",
        );
      }
      const after = inventoryOf();
      const accepted = response.status === 201 && equal(value?.items, items);
      if (currentId === "order" && ready && accepted) finish();
      if (currentId === "fail" && ready && response.status === 503) finish();
      if (currentId === "retry" && ready && accepted && equal(original, items))
        finish();
      if (
        currentId === "connect" &&
        walkthroughVersion < 6 &&
        ready &&
        accepted
      ) {
        orderIds.push(value.orderId!);
        if (orderIds.length >= 2 && orderIds.at(-1) === orderIds.at(-2)! + 1)
          finish();
        else {
          const message =
            "The next confirmation should have an order ID one greater than the first. Click Add to cart on House Blend, then Place order again.";
          record(
            "tutor",
            message,
            true,
            "Add one bag of House Blend again, then click Place order. This uses the same context counter for a second confirmation.",
          );
        }
      }
      if (
        currentId === "decaf" &&
        accepted &&
        items.some((item) => item.productId === "decaf") &&
        after.decaf! > 0
      )
        finish();
      if (
        currentId === "rules" &&
        ready &&
        response.status === 409 &&
        Array.isArray(value?.shortages) &&
        value.shortages.some(
          (shortage: { requested: number; available: number }) =>
            shortage.requested > shortage.available,
        )
      ) {
        rejectionSeen = true;
        const message =
          "The oversized order was rejected. Click Empty cart, restore Dark Roast inventory to 3 in the terminal’s REPL, then click Refresh products.";
        record(
          "tutor",
          message,
          true,
          "Click Empty cart in the shop. In the REPL, assign 3 to the `dark-roast` entry in `context.inventory`. Return to the shop and click Refresh products.",
        );
      }
      const quantity = items
        .filter((item) => item.productId === "dark-roast")
        .reduce((sum, item) => sum + item.quantity, 0);
      if (
        accepted &&
        quantity > 0 &&
        fresh &&
        before["dark-roast"] !== undefined &&
        after["dark-roast"] !== undefined
      ) {
        const observed = {
          before: before["dark-roast"]!,
          after: after["dark-roast"]!,
          quantity,
        };
        const message =
          "Dark Roast API stock: " +
          observed.before +
          " → " +
          observed.after +
          " after buying " +
          quantity +
          ".";
        if (
          currentId === "observe" &&
          (observed.after === observed.before ||
            observed.after === observed.before - quantity)
        ) {
          observation = observed;
          record("tutor", message);
          quizWrong = false;
          renderLesson();
        }
        if (
          currentId === "reduce" &&
          ready &&
          observed.after === observed.before - quantity
        )
          finish();
        if (
          currentId === "restock" &&
          observed.before === 5 &&
          quantity === 1 &&
          observed.after === 4
        )
          finish();
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No order confirmation. Your cart has been kept; inspect the API before retrying.";
      byId("shop-notice").textContent =
        "We couldn’t place your order. Your cart has been kept.";
      record("tutor", "The order has no usable confirmation: " + message, true);
    } finally {
      busy = false;
      renderLesson();
      renderShop();
      renderStatus();
      save();
    }
  }
  function checkFiles(force = false): Promise<void> {
    if (checking)
      return checking.then(() =>
        force || checkedPhase !== phase().id ? checkFiles(force) : undefined,
      );
    checking = runCheckFiles(force).finally(() => {
      checking = undefined;
    });
    return checking;
  }
  async function runCheckFiles(force: boolean) {
    const requestedId = phase().id;
    let announcedSave = false;
    try {
      const { response, value: latest } = await json<Info>("/tutorial-info");
      if (
        !response.ok ||
        typeof latest.revision !== "string" ||
        typeof latest.sessionId !== "string"
      )
        throw new Error("Tutorial information unavailable.");
      if (info && latest.sessionId !== info.sessionId) {
        window.location.reload();
        return;
      }
      const locationsChanged =
        JSON.stringify(info?.workspace?.locations) !==
        JSON.stringify(latest.workspace?.locations);
      const stateChanged = !!info && !equal(info.state, latest.state);
      if (stateChanged) acknowledgeVisibleMessages();
      info = latest;
      const changed = syncChanges(info.workspace?.changes);
      if (
        syncReplSubmissions(info.replSubmissions) ||
        changed ||
        locationsChanged ||
        (stateChanged && requestedId === "context-repl")
      )
        renderLesson();
      if (phase().id !== requestedId) return;
      if (resumeCheckpoint !== undefined) return;
      await loadProposal(requestedId);
      if (phase().id !== requestedId) return;
      if (
        (phase().check || requestedId === "context-repl") &&
        (force ||
          checkedRevision !== info.revision ||
          checkedPhase !== requestedId)
      ) {
        const revision = info.revision;
        const { value: checked } = await json<{
          ok: boolean;
          revision: string;
          message: string;
          example?: string;
          examples?: string[];
        }>("/tutorial-check", {
          phaseId: requestedId === "context-repl" ? "connect" : requestedId,
        });
        const { value: after } = await json<Info>("/tutorial-info");
        if (
          phase().id !== requestedId ||
          revision !== after.revision ||
          checked.revision !== revision
        ) {
          checkedPhase = "";
          return;
        }
        info = after;
        const changedAfterCheck = syncChanges(info.workspace?.changes);
        if (syncReplSubmissions(info.replSubmissions) || changedAfterCheck)
          renderLesson();
        ready = checked.ok === true;
        if (["name-example", "description-example"].includes(requestedId))
          expectedExamples =
            checked.examples ??
            (checked.example ? [checked.example] : undefined);
        checkMessage = ready
          ? ""
          : force ||
              (checkedPhase === requestedId && checkedRevision !== revision)
            ? "Check: " + checked.message
            : "";
        if (
          ready &&
          (force ||
            changed ||
            changedAfterCheck ||
            checkedPhase !== requestedId) &&
          requestedId !== "context" &&
          !(
            walkthroughVersion >= 6 &&
            ["connect", "context-repl"].includes(requestedId)
          ) &&
          !(
            requestedId === "scenario" &&
            entryState?.inventory?.["dark-roast"] === 5 &&
            info.state.inventory?.["dark-roast"] !== 5
          ) &&
          !(
            requestedId === "seed" &&
            hasBaseline(entryState) &&
            !hasBaseline(info.state)
          ) &&
          !completed.has(requestedId) &&
          !turns.some(
            (turn) =>
              turn.phaseId === requestedId &&
              turn.verificationRevision === revision,
          )
        ) {
          const feedback = record(
            "tutor",
            requestedId === "seed" && hasBaseline(entryState)
              ? "Startup has already applied the baseline in this session. To observe reset changing state, set Dark Roast to 0 in the REPL."
              : requestedId === "scenario" &&
                  entryState?.inventory?.["dark-roast"] === 5
                ? "Dark Roast already has 5 bags. To make your scenario’s change observable, set Dark Roast inventory to 4 in the REPL."
                : (phase().verification ?? checked.message),
            true,
            requestedId === "seed" && hasBaseline(entryState)
              ? "In the terminal’s REPL, assign 0 to the `dark-roast` entry in `context.inventory` and press Enter. Milo will detect that the baseline has changed."
              : requestedId === "scenario" &&
                  entryState?.inventory?.["dark-roast"] === 5
                ? "In the terminal’s REPL, assign 4 to the `dark-roast` entry in `context.inventory` and press Enter. Milo will detect the lower quantity automatically."
                : phase().verificationHint,
          );
          feedback.verificationRevision = revision;
          announcedSave = true;
          renderLesson();
        }
        if (checkedRevision !== revision) {
          catalogReads = 0;
          lastCatalog = "";
        }
        checkedRevision = revision;
        checkedPhase = requestedId;
        if (requestedId === "context-repl") renderLesson();
      }
      if (!missing() && ready && !completed.has(requestedId)) {
        const leftBaseline =
          requestedId === "seed" &&
          hasBaseline(entryState) &&
          !hasBaseline(info.state);
        if (leftBaseline) {
          entryState = JSON.parse(JSON.stringify(info.state));
          record(
            "tutor",
            "The running shop has changed. Run the reset scenario in the REPL.",
            true,
            phase().verificationHint,
          );
          renderLesson();
        }
        if (requestedId === "connect" && walkthroughVersion >= 6)
          finish(phase().verification);
        if (requestedId === "context")
          finish(
            phase().verification ??
              "Your shared context implementation is ready.",
          );
        if (
          requestedId === "seed" &&
          hasBaseline(info.state) &&
          !hasBaseline(entryState)
        )
          finish();
        else if (
          requestedId === "seed" &&
          stateChanged &&
          !announcedSave &&
          !leftBaseline &&
          !hasBaseline(info.state) &&
          !turns.some(
            (turn) =>
              turn.phaseId === requestedId &&
              turn.text === baselineRecovery(info.state),
          )
        ) {
          record("tutor", baselineRecovery(info.state), true);
          renderLesson();
        }
        if (requestedId === "scenario") {
          const loweredFromFive =
            entryState?.inventory?.["dark-roast"] === 5 &&
            !!info.state.inventory &&
            info.state.inventory["dark-roast"] !== 5;
          if (loweredFromFive) {
            entryState = JSON.parse(JSON.stringify(info.state));
            record(
              "tutor",
              "Dark Roast’s quantity has changed. Run `restockDarkRoast` through the REPL’s `.scenario` command.",
              true,
              phase().verificationHint,
            );
            renderLesson();
          }
          const before = entryState?.inventory,
            after = info.state.inventory;
          if (
            before &&
            after &&
            before["dark-roast"] !== 5 &&
            after["dark-roast"] === 5 &&
            Object.entries(before).every(
              ([id, stock]) => id === "dark-roast" || after[id] === stock,
            )
          )
            finish();
          else if (!announcedSave && stateChanged && !loweredFromFive) {
            record(
              "tutor",
              "Other inventory should stay unchanged. With Dark Roast below 5, run `restockDarkRoast` through the REPL’s `.scenario` command.",
              true,
            );
            renderLesson();
          }
        }
      }
      save();
      renderStatus();
    } catch {
      checkMessage =
        "Could not check saved files. I’ll retry automatically. Check Counterfact’s terminal for errors.";
      renderStatus();
    }
  }
  byId("refresh-products").onclick = async () => {
    if (busy) return;
    acknowledgeVisibleMessages();
    busy = true;
    renderShop();
    await checkFiles();
    const action = uiAction("Refreshed products.");
    await refreshProducts("manual", action);
    await checkFiles(true);
    busy = false;
    renderShop();
  };
  byId("hint").onclick = () => {
    const hint = currentHint();
    if (!hint || typing) return;
    if (revealedHints.has(hint.key)) revealedHints.delete(hint.key);
    else
      revealedHints.set(hint.key, {
        messageId: hint.prompt.dataset.messageId!,
        text: hint.text,
      });
    renderLesson();
  };
  byId("checkout").onclick = placeOrder;
  byId("empty-cart").onclick = () => {
    const emptied = [...cart].map(([productId, quantity]) => ({
      productId,
      quantity,
    }));
    cart.clear();
    uiAction(
      emptied.length
        ? "Emptied the cart: " + describeItems(emptied) + "."
        : "Emptied the cart (it was already empty).",
    );
    if (phase().id !== "retry") failedItems = undefined;
    renderShop();
  };
  let advancing = false;
  byId("continue").onclick = async () => {
    if (advancing) return;
    acknowledgeVisibleMessages();
    const next = phases[index + 1];
    if (completed.has(phase().id) && next) {
      advancing = true;
      const currentId = phase().id;
      try {
        await checkFiles();
        if (phase().id !== currentId) return;
        let destination = index + 1;
        if (info.workspace?.enabled) {
          const { value: result } = await json<WorkflowResult>(
            "/tutorial-workspace",
            {
              action: "advance",
              phaseId: currentId,
              sessionId: info.sessionId,
            },
          );
          if (!result.ok) throw new Error(result.message);
          if (
            result.flow?.status !== "advance" ||
            result.flow.nextPhaseId !== next.id
          )
            throw new Error(
              "Could not determine the next lesson. Reload and try again.",
            );
          destination = phases.findIndex(
            (candidate) => candidate.id === result.flow!.nextPhaseId,
          );
        }
        record("you", "Next Lesson: " + next.title);
        move(destination);
      } catch (error) {
        record(
          "tutor",
          "Could not start the next lesson: " +
            (error instanceof Error ? error.message : String(error)) +
            " Click Next Lesson to retry.",
          true,
        );
        renderLesson();
      } finally {
        advancing = false;
      }
    }
  };
  async function start() {
    const { value: initial } = await json<Info>("/tutorial-info");
    info = initial;
    let projectCheckpoint = 0;
    if (info.workspace?.enabled)
      while (
        phases.some(
          (candidate) => candidate.lesson === projectCheckpoint + 1,
        ) &&
        info.workspace.checkpoints.includes(projectCheckpoint + 1)
      )
        projectCheckpoint++;
    seenChanges = new Set(
      initial.workspace?.changes?.map((change) => change.id) ?? [],
    );
    let restored = false;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (
        saved?.version === walkthroughVersion &&
        saved.sessionId === info.sessionId
      ) {
        restored = true;
        folderOpened = saved.folderOpened === true;
        if (Array.isArray(saved.revealedHints))
          for (const entry of saved.revealedHints)
            if (
              Array.isArray(entry) &&
              typeof entry[0] === "string" &&
              typeof entry[1]?.messageId === "string" &&
              typeof entry[1]?.text === "string"
            )
              revealedHints.set(entry[0], entry[1]);
        if (Array.isArray(saved.displayedMessages)) {
          typing = undefined;
          displayedMessages.clear();
          for (const id of saved.displayedMessages)
            if (typeof id === "string") displayedMessages.add(id);
          messageAllowance = 0;
        }
        if (
          saved.revealedMessages &&
          typeof saved.revealedMessages === "object"
        )
          for (const [key, count] of Object.entries(saved.revealedMessages))
            if (Number.isSafeInteger(count) && (count as number) > 0)
              revealedMessages[key] = count as number;
        if (saved.diffStates && typeof saved.diffStates === "object")
          for (const [key, open] of Object.entries(saved.diffStates))
            if (typeof open === "boolean") diffStates[key] = open;
        if (
          projectCheckpoint > 0 &&
          saved.resumeCheckpoint === projectCheckpoint
        )
          resumeCheckpoint = saved.resumeCheckpoint;
        if (
          Number.isInteger(saved.index) &&
          saved.index >= 0 &&
          saved.index < phases.length
        )
          index = saved.index;
        completed = new Set(
          (Array.isArray(saved.completed) ? saved.completed : []).filter(
            (id: unknown) => phases.some((candidate) => candidate.id === id),
          ),
        );
        turns = (Array.isArray(saved.turns) ? saved.turns : []).filter(
          (turn: Turn) =>
            turn &&
            phases.some((candidate) => candidate.id === turn.phaseId) &&
            ["you", "tutor"].includes(turn.role) &&
            typeof turn.text === "string",
        );
        for (const turn of turns)
          for (const exchange of turn.exchanges ?? []) {
            if (exchange.pending) {
              exchange.pending = false;
              exchange.error =
                "The page reloaded before a response was recorded. Inspect the API state before retrying.";
            }
          }
        seenChanges = new Set(
          Array.isArray(saved.seenChanges)
            ? saved.seenChanges.filter((id: unknown) =>
                Number.isSafeInteger(id),
              )
            : [],
        );
        seenReplSubmissions = new Set(
          Array.isArray(saved.seenReplSubmissions)
            ? saved.seenReplSubmissions.filter(
                (id: unknown) => typeof id === "string",
              )
            : [],
        );
        quizWrong = saved.quizWrong === true;
        const required = phases.findIndex(
          (candidate) => !completed.has(candidate.id),
        );
        if (required >= 0) index = Math.min(index, required);
        cart = new Map(
          (Array.isArray(saved.cart) ? saved.cart : []).filter(
            (entry: unknown) =>
              Array.isArray(entry) &&
              typeof entry[0] === "string" &&
              Number.isSafeInteger(entry[1]) &&
              entry[1] > 0,
          ),
        );
        if (
          saved.observation &&
          [
            saved.observation.before,
            saved.observation.after,
            saved.observation.quantity,
          ].every(Number.isSafeInteger) &&
          saved.observation.quantity > 0
        )
          observation = saved.observation;
        if (
          Array.isArray(saved.failedItems) &&
          saved.failedItems.every(
            (item: Item) =>
              typeof item.productId === "string" &&
              Number.isSafeInteger(item.quantity) &&
              item.quantity > 0,
          )
        )
          failedItems = saved.failedItems;
        entryState = saved.entryState;
        catalogReads = saved.catalogReads ?? 0;
        lastCatalog = saved.lastCatalog ?? "";
        orderIds = saved.orderIds ?? [];
        rejectionSeen = saved.rejectionSeen === true;
      }
    } catch {
      /* A corrupt or unavailable saved session starts fresh. */
    }
    if (!restored && projectCheckpoint > 0)
      resumeCheckpoint = projectCheckpoint;
    syncChanges(info.workspace?.changes);
    syncReplSubmissions(info.replSubmissions);
    entryState ??= JSON.parse(JSON.stringify(info.state));
    report("opened", phases[0]!.id);
    renderLesson();
    await checkFiles();
    await refreshProducts("initial");
    return { refreshProducts, placeOrder, checkFiles };
  }
  let initialized = false;
  let initializing = false;
  async function initialize() {
    initializing = true;
    try {
      const api = await start();
      initialized = true;
      return api;
    } catch {
      checkMessage =
        "Could not initialize the walkthrough. This page will retry automatically. Check Counterfact’s terminal.";
      renderStatus();
    } finally {
      initializing = false;
    }
  }
  setupPanelDivider();
  showConnectionAlert(false);
  renderLesson();
  setInterval(() => {
    if (document.hidden || busy || initializing) return;
    if (initialized) void checkFiles();
    else void initialize();
  }, 1000);
  return initialize();
}
