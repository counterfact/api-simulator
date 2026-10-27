import type { EditEvent, FileChange } from "./coffee-shop-workspace.js";
import type { LessonPhase } from "./coffee-shop-lessons.js";

/** Serialized into the page; keep all browser dependencies inside this function. */
export function runCoffeeShopWalkthrough(
  projectPath: string,
  phases: LessonPhase[],
  restartDirectory: string,
  restartCommand: string,
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
    };
    sessionId: string;
    revision: string;
    state: { catalog: unknown; inventory: Record<string, number> | null };
  };
  type Observation = { before: number; after: number; quantity: number };
  const byId = (id: string) => document.getElementById(id)!;
  const node = (tag: string, text = "", className = "") => {
    const result = document.createElement(tag);
    result.textContent = text;
    result.className = className;
    return result;
  };
  const button = (text: string, action: () => unknown) => {
    const result = node("button", text, "secondary") as HTMLButtonElement;
    result.onclick = action;
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
  const storageKey = "counterfact-coffee-v2";
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
  let message = "",
    checkMessage = "",
    quizWrong = false;
  let observation: Observation | undefined, failedItems: Item[] | undefined;
  let entryState: Info["state"] | undefined;
  let catalogReads = 0,
    lastCatalog = "",
    orderIds: number[] = [],
    rejectionSeen = false;
  type Turn = {
    phaseId: string;
    role: "you" | "tutor";
    text: string;
    files?: FileChange[];
  };
  let seenChanges = new Set<number>();
  let turns: Turn[] = [];
  function record(role: Turn["role"], text: string) {
    turns.push({ phaseId: phase().id, role, text });
    save();
  }
  function uiAction(text: string) {
    record("you", text);
    renderLesson();
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
  const traces: Record<string, unknown> = {};
  const reported = new Set<string>();
  function save() {
    if (!info) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          version: 2,
          sessionId: info.sessionId,
          index,
          completed: [...completed],
          turns,
          seenChanges: [...seenChanges],
          quizWrong,
          cart: [...cart],
          observation,
          failedItems,
          entryState,
          catalogReads,
          lastCatalog,
          orderIds,
          rejectionSeen,
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
  async function json<T = unknown>(path: string, body?: unknown) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(path, {
        signal: controller.signal,
        ...(body === undefined
          ? {}
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      });
      const value = (await response.json()) as T;
      if (path === "/products" || path === "/orders") {
        traces[path] = {
          method: body === undefined ? "GET" : "POST",
          url: origin + path,
          ...(body === undefined ? {} : { request: body }),
          status: response.status,
          response: value,
        };
        byId("request-trace").textContent = JSON.stringify(traces, null, 2);
      }
      return { response, value };
    } finally {
      clearTimeout(timer);
    }
  }
  function fileLink(file: string, label = file) {
    const result = node("a", label) as HTMLAnchorElement;
    const base = new URL("vscode://file/");
    base.pathname =
      (projectPath.startsWith("/") || /^[A-Za-z]:/u.test(projectPath)
        ? ""
        : "/") +
      projectPath.replace(/\\/gu, "/") +
      "/";
    result.href = new URL(file, base).href;
    result.title = "Open in VSCode";
    return result;
  }
  function fileText(tag: string, text: string) {
    const result = node(tag);
    const files = [
      "routes/_.context.ts",
      "routes/products.ts",
      "routes/orders.ts",
      "scenarios/index.ts",
      "openapi.json",
    ];
    while (text) {
      const match = files
        .map((file) => ({ file, index: text.indexOf(file) }))
        .filter((candidate) => candidate.index >= 0)
        .sort((a, b) => a.index - b.index)[0];
      if (!match) {
        result.append(node("span", text));
        break;
      }
      if (match.index) result.append(node("span", text.slice(0, match.index)));
      result.append(fileLink(match.file));
      text = text.slice(match.index + match.file.length);
    }
    return result;
  }
  let finishing = false;
  let checkpointRetry: (() => unknown) | undefined;
  async function finish(completionMessage = "Observed behavior verified.") {
    if (missing() || completed.has(phase().id) || finishing) return;
    if (info?.workspace?.enabled) {
      finishing = true;
      try {
        const { value: result } = await json<{ ok: boolean; message: string }>(
          "/tutorial-workspace",
          {
            action: "checkpoint",
            phaseId: phase().id,
            sessionId: info.sessionId,
          },
        );
        if (!result.ok) throw new Error(result.message);
        // Completion is recorded separately from file-change history.
        checkpointRetry = undefined;
      } catch (error) {
        message =
          "Could not save lesson progress: " +
          (error instanceof Error ? error.message : String(error));
        checkpointRetry = () => finish(completionMessage);
        renderLesson();
        return;
      } finally {
        finishing = false;
      }
    }
    message = completionMessage;
    record("tutor", "That worked. " + completionMessage);
    completed.add(phase().id);
    report("phase_completed");
    save();
    const next = phases[index + 1];
    if (next && next.lesson === phase().lesson) move(index + 1);
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
    message = "";
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
    byId("current-turn")?.scrollIntoView?.({ block: "start" });
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
  function bubble(role: "you" | "tutor", text = "") {
    const result = node(
      "article",
      "",
      "chat-turn " + (role === "you" ? "learner-turn" : "tutor-turn"),
    );
    result.append(
      node(
        "div",
        role === "you" ? "You" : "Milo · your Counterfact tutor",
        "speaker",
      ),
    );
    if (text) result.append(fileText("p", text));
    return result;
  }
  function renderDiff(change: FileChange) {
    const details = node("details", "", "file-diff") as HTMLDetailsElement;
    details.open = true;
    details.append(
      node("summary", change.file),
      fileLink(change.file, "Open file"),
    );
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
    let omitted = false;
    rows.forEach((row, index) => {
      const nearEdit = rows
        .slice(Math.max(0, index - 3), index + 4)
        .some((candidate) => candidate.kind !== "context");
      if (!nearEdit) {
        if (!omitted)
          pre.append(node("span", "  …\n", "diff-line diff-context"));
        omitted = true;
        return;
      }
      omitted = false;
      pre.append(
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
  function turnBubble(turn: Turn) {
    const result = bubble(turn.role, turn.text);
    for (const file of turn.files ?? []) result.append(renderDiff(file));
    return result;
  }
  function renderLesson() {
    const current = phase(),
      lesson = byId("lesson");
    const openHints = new Set(
      Array.from(
        lesson.querySelectorAll<HTMLDetailsElement>("details[open]"),
      ).map((hint) => hint.dataset.hint),
    );
    lesson.replaceChildren();
    const welcome = bubble("tutor");
    welcome.append(
      node("h2", "Hi, I’m Milo."),
      node(
        "p",
        "I run this little coffee shop. Let’s build its local API together, one behavior at a time.",
      ),
      node(
        "p",
        "We’ll take turns. I’ll explain the supporting edits I want to make, and you’ll click ‘Yes, make these edits’ to approve them. Then I’ll guide you through a small edit of your own in your editor. You’ll try it in the shop or terminal, and we’ll compare what actually happened before moving on.",
      ),
      node(
        "p",
        "Open this demo folder in your editor. Whenever either of us changes a lesson file, I’ll show the diff here in our conversation: green lines were added and red lines were removed. Your saved edits appear automatically, so we can follow exactly how the API gains behavior.",
      ),
    );
    lesson.append(welcome);
    for (const [phaseIndex, revealed] of phases.entries()) {
      if (phaseIndex > index) break;
      const active = revealed.id === current.id;
      const prepared = !!info?.workspace?.prepared.includes(revealed.id);
      const finished = completed.has(revealed.id);
      const heading = bubble("tutor");
      if (active) heading.id = "current-turn";
      heading.append(node("div", "Lesson " + revealed.lesson, "eyebrow"));
      const explanation = fileText("p", revealed.explanation);
      if (revealed.id === "explore") {
        const link = node("a", origin) as HTMLAnchorElement;
        link.href = origin;
        explanation.append(link, node("span", "."));
      }
      heading.append(node("h3", revealed.title), explanation);
      lesson.append(heading);
      if (revealed.preparation) {
        const proposal = bubble(
          "tutor",
          "Here’s what I’d like to change: " + revealed.preparation,
        );
        proposal.append(
          node(
            "p",
            "May I make these supporting edits? You’ll be able to review the diff here before making your part of the change.",
          ),
        );
        if (
          active &&
          !prepared &&
          !finished &&
          info?.workspace?.enabled &&
          !missing()
        ) {
          const approve = button("Yes, make these edits", async () => {
            approve.disabled = true;
            record("you", "Yes, make these edits.");
            try {
              const { value: result } = await json<{
                ok: boolean;
                message: string;
                changes?: EditEvent[];
              }>("/tutorial-workspace", {
                action: "prepare",
                phaseId: revealed.id,
                sessionId: info.sessionId,
              });
              if (result.ok) {
                info.workspace!.prepared.push(revealed.id);
                checkedPhase = "";
                syncChanges(result.changes);
                record(
                  "tutor",
                  "I’ve added the supporting code. Review that diff. Now it’s your turn.",
                );
              } else
                record(
                  "tutor",
                  "I couldn’t apply that edit: " + result.message,
                );
            } catch (error) {
              record(
                "tutor",
                "I couldn’t apply that edit: " +
                  (error instanceof Error ? error.message : String(error)),
              );
            }
            renderLesson();
            await checkFiles();
          });
          proposal.append(approve);
        }
        lesson.append(proposal);
      }
      const phaseTurns = turns.filter((turn) => turn.phaseId === revealed.id);
      // The approval exchange precedes the exercise; observations and replies follow it.
      const approvalEnd = phaseTurns.findIndex(
        (turn) => turn.role === "tutor" && turn.text.startsWith("I’ve added"),
      );
      const preparationEnd =
        approvalEnd >= 0
          ? approvalEnd
          : phaseTurns.findIndex(
              (turn) => turn.role === "tutor" && turn.files?.length,
            );
      const before = !revealed.preparation
        ? []
        : preparationEnd < 0 && !prepared
          ? phaseTurns
          : phaseTurns.slice(0, preparationEnd + 1);
      for (const turn of before) lesson.append(turnBubble(turn));
      if (
        revealed.preparation &&
        !prepared &&
        !finished &&
        info?.workspace?.enabled
      )
        continue;
      const exercise = bubble("tutor");
      exercise.append(fileText("p", revealed.instruction));
      for (const [editIndex, edit] of revealed.edits.entries()) {
        const actions = node("div", "", "file-actions");
        actions.append(
          fileLink(edit.file, "Open in VSCode"),
          button("Copy file path", async () => {
            try {
              await navigator.clipboard.writeText(
                projectPath + "/" + edit.file,
              );
              message = "File path copied.";
            } catch {
              message =
                "Open or copy this file: " + projectPath + "/" + edit.file;
            }
            renderStatus();
          }),
        );
        const hint = node("details", "", "code-hint") as HTMLDetailsElement;
        hint.dataset.hint = revealed.id + ":" + editIndex;
        hint.open = openHints.has(hint.dataset.hint);
        hint.append(
          node("summary", "Show code: " + edit.file),
          node("p", edit.instruction),
          fileLink(edit.file, projectPath + "/" + edit.file),
          node("pre", edit.code),
        );
        exercise.append(actions, hint);
      }
      if (revealed.commands)
        exercise.append(
          node("p", "In Counterfact’s terminal (⬣>):"),
          node("pre", revealed.commands.join("\n")),
        );
      lesson.append(exercise);
      for (const turn of phaseTurns.slice(before.length))
        lesson.append(turnBubble(turn));
      if (active && current.id === "observe" && !finished) renderQuestion();
      if (active && finished) {
        const done = node("p", "✓ Lesson complete", "step-complete");
        done.id = "step-completion";
        lesson.append(done);
        if (index === phases.length - 1) {
          const goodbye = bubble(
            "tutor",
            "We’ve built the shop’s behavior together. Keep experimenting: add another product or a new failure condition. You can scroll back through our conversation whenever you need a reminder.",
          );
          goodbye.append(
            node("p", "To restart, run this from " + restartDirectory + ":"),
            node(
              "pre",
              restartCommand + " --port " + (window.location.port || "3100"),
            ),
            node(
              "p",
              "Restarting keeps your code and runs startup again. It begins a new walkthrough session; it does not regenerate or overwrite your implementations.",
            ),
          );
          lesson.append(goodbye);
        }
      }
    }
    if (checkpointRetry)
      lesson.append(button("Retry saving progress", checkpointRetry));
    (byId("continue") as HTMLButtonElement).hidden =
      !completed.has(current.id) || index === phases.length - 1;
    (byId("check-progress") as HTMLButtonElement).hidden = !!(
      current.preparation &&
      info?.workspace?.enabled &&
      !info.workspace.prepared.includes(current.id) &&
      !completed.has(current.id)
    );
    renderStatus();
  }
  function renderStatus() {
    byId("guide-status").textContent = message;
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
      add.disabled = busy || !fresh || available === 0;
      card.append(add);
      byId("products").append(card);
    }
    if (!products.length)
      byId("products").append(
        node(
          "p",
          fresh
            ? "The API returned an empty catalog. Inspect the response below."
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
    if (missing() || !fresh) return;
    const id = phase().id;
    if (id === "explore" && source === "manual") {
      report("started", phases[0]!.id);
      finish(message || "Generated response refreshed.");
    }
    if (id === "catalog" && ready && source === "manual") {
      const current = JSON.stringify(products);
      catalogReads = current === lastCatalog ? catalogReads + 1 : 1;
      lastCatalog = current;
      if (catalogReads >= 2) finish();
      else
        message =
          "Explicit catalog received. Refresh once more to compare responses.";
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
  async function refreshProducts(source = "manual") {
    try {
      const { response, value } = await json("/products");
      if (!response.ok || !validProducts(value))
        throw new Error(
          "The products response is invalid or contains duplicate IDs. Inspect it below, fix the handler or refresh again.",
        );
      if (
        !completed.has("catalog") &&
        !(phase().id === "catalog" && ready) &&
        source === "manual" &&
        cart.size
      ) {
        cart.clear();
        message =
          "Refreshing random products clears the previous cart because product IDs and prices may change.";
      }
      products = value;
      fresh = true;
      if (source === "manual") {
        record(
          "tutor",
          "GET /products returned HTTP " +
            response.status +
            " with " +
            products.length +
            " products." +
            (message.startsWith("Refreshing random products clears")
              ? " " + message
              : ""),
        );
        renderLesson();
      }
      renderShop();
      observeProducts(source);
      return true;
    } catch (error) {
      fresh = false;
      message =
        error instanceof Error
          ? error.message
          : "Product request failed. Click Refresh products to retry.";
      if (source === "manual") {
        record("tutor", "The product refresh failed: " + message);
        renderLesson();
      }
      renderShop();
      renderStatus();
      return false;
    }
  }
  async function placeOrder() {
    if (busy || !fresh || !cart.size) return;
    busy = true;
    renderShop();
    const currentId = phase().id,
      before = inventoryOf(),
      items = [...cart].map(([productId, quantity]) => ({
        productId,
        quantity,
      }));
    uiAction(
      (failedItems ? "Retried the order: " : "Placed an order: ") +
        describeItems(items) +
        ".",
    );
    try {
      await checkFiles();
      if (phase().id !== currentId) return;
      const { response, value } = await json<{
        orderId?: number;
        items?: Item[];
        error?: string;
        shortages?: { requested: number; available: number }[];
      }>("/orders", { items });
      const original = failedItems;
      record(
        "tutor",
        "POST /orders returned HTTP " +
          response.status +
          (response.status === 201 && Number.isInteger(value?.orderId)
            ? " with order ID " + value.orderId + "."
            : value?.error
              ? ": " +
                value.error +
                (/[.!?]$/u.test(value.error) ? " " : ". ") +
                "The cart has been kept."
              : "."),
      );
      if (response.status === 201 && Number.isInteger(value?.orderId)) {
        cart.clear();
        failedItems = undefined;
        byId("shop-notice").textContent =
          "HTTP 201 received. Inspect the request and response below.";
      } else if (response.ok)
        throw new Error(
          "The confirmation has no integer orderId. Inspect POST /orders below before retrying; the order may have been accepted.",
        );
      else {
        failedItems = items;
        byId("shop-notice").textContent =
          (value?.error ?? "Order rejected") + " Your cart has been kept.";
      }
      await refreshProducts("order");
      if (phase().id !== currentId || missing()) return;
      const after = inventoryOf();
      const accepted = response.status === 201 && equal(value?.items, items);
      if (currentId === "order" && ready && accepted) finish();
      if (currentId === "fail" && ready && response.status === 503) finish();
      if (currentId === "retry" && ready && accepted && equal(original, items))
        finish();
      if (currentId === "connect" && ready && accepted) {
        orderIds.push(value.orderId!);
        if (orderIds.length >= 2 && orderIds.at(-1) === orderIds.at(-2)! + 1)
          finish();
        else
          message = "Order confirmed. Place another order and compare its ID.";
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
        message =
          "Stock rejection observed. Empty your cart, restore Dark Roast to 3 in the REPL, then refresh products.";
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
        message =
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
      message =
        error instanceof Error
          ? error.message
          : "No order confirmation. Your cart has been kept; inspect the API before retrying.";
      record("tutor", "The order has no usable confirmation: " + message);
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
    try {
      const { response, value: latest } = await json<Info>("/tutorial-info");
      if (
        !response.ok ||
        typeof latest.revision !== "string" ||
        typeof latest.sessionId !== "string"
      )
        throw new Error("Tutorial information unavailable.");
      info = latest;
      if (syncChanges(info.workspace?.changes)) renderLesson();
      if (phase().id !== requestedId) return;
      if (
        phase().check &&
        (force ||
          checkedRevision !== info.revision ||
          checkedPhase !== requestedId)
      ) {
        const revision = info.revision;
        const { value: checked } = await json<{
          ok: boolean;
          revision: string;
          message: string;
        }>("/tutorial-check", { phaseId: requestedId });
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
        if (syncChanges(info.workspace?.changes)) renderLesson();
        ready = checked.ok === true;
        checkMessage = ready
          ? checked.message
          : force ||
              (checkedPhase === requestedId && checkedRevision !== revision)
            ? "Check: " + checked.message
            : "";
        if (checkedRevision !== revision) {
          catalogReads = 0;
          lastCatalog = "";
        }
        checkedRevision = revision;
        checkedPhase = requestedId;
      }
      if (force && !missing() && ready) {
        if (
          requestedId === "context" &&
          Array.isArray(info.state.catalog) &&
          info.state.catalog.length === 0 &&
          info.state.inventory &&
          Object.keys(info.state.inventory).length === 0
        )
          finish();
        if (
          requestedId === "seed" &&
          info.state.inventory?.["dark-roast"] === 3 &&
          !equal(entryState, info.state)
        )
          finish();
        if (requestedId === "scenario") {
          if (
            entryState?.inventory?.["dark-roast"] === 5 &&
            info.state.inventory &&
            info.state.inventory["dark-roast"] !== 5
          ) {
            entryState = JSON.parse(JSON.stringify(info.state));
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
          else
            message =
              "Run .scenario restockDarkRoast after changing Dark Roast below 5, then refresh and check progress. Other inventory should stay unchanged.";
        }
      }
      save();
      renderStatus();
    } catch {
      checkMessage =
        "Could not check saved files. Check Counterfact’s terminal, then click Check my work to retry.";
      renderStatus();
    }
  }
  byId("refresh-products").onclick = async () => {
    if (busy) return;
    busy = true;
    uiAction("Refreshed products.");
    renderShop();
    await checkFiles();
    await refreshProducts();
    await checkFiles(true);
    busy = false;
    renderShop();
  };
  byId("check-progress").onclick = () => {
    record("you", "Please check my work.");
    renderLesson();
    return checkFiles(true);
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
  byId("continue").onclick = () => {
    if (completed.has(phase().id)) {
      record("you", "I’m ready. What’s next?");
      move(index + 1);
    }
  };
  async function start() {
    const { value: initial } = await json<Info>("/tutorial-info");
    info = initial;
    seenChanges = new Set(
      initial.workspace?.changes?.map((change) => change.id) ?? [],
    );
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (saved?.version === 2 && saved.sessionId === info.sessionId) {
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
        seenChanges = new Set(
          Array.isArray(saved.seenChanges)
            ? saved.seenChanges.filter((id: unknown) =>
                Number.isSafeInteger(id),
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
    syncChanges(info.workspace?.changes);
    entryState ??= JSON.parse(JSON.stringify(info.state));
    report("opened", phases[0]!.id);
    renderLesson();
    await checkFiles();
    await refreshProducts("initial");
    setInterval(() => {
      if (!document.hidden && !busy) void checkFiles();
    }, 1000);
    return { refreshProducts, placeOrder, checkFiles };
  }
  renderLesson();
  return start().catch(() => {
    message =
      "Could not initialize the walkthrough. Check Counterfact’s terminal, then click Refresh products to reconnect.";
    renderStatus();
  });
}
