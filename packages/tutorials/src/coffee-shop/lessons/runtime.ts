import { Annotation } from "@langchain/langgraph";
import type { LessonPhase } from "../coffee-shop-lessons.js";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { WorkflowResult } from "../coffee-shop-workflow.js";

export type LessonOperations = {
  preview(phaseId: string): Promise<WorkflowResult>;
  prepare(phaseId: string, revision?: string): Promise<WorkflowResult>;
  check(phaseId: string): Promise<WorkflowResult>;
};

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
};
export type Item = { productId: string; quantity: number };
export type ShopState = {
  catalog: unknown;
  inventory: Record<string, number> | null;
};
export type Observation = { before: number; after: number; quantity: number };
export type LessonInput = {
  event:
    "products" | "order" | "poll" | "answer" | "preview" | "prepare" | "check";
  revision?: string;
  ready: boolean;
  prepared: boolean;
  source?: string;
  products: Product[];
  state: ShopState;
  entryState?: ShopState;
  baseline: Product[];
  cartSize: number;
  expectedExamples?: string[];
  catalogReads: number;
  lastCatalog: string;
  rejectionSeen: boolean;
  before?: Record<string, number>;
  items?: Item[];
  original?: Item[];
  status?: number;
  response?: {
    orderId?: number;
    items?: Item[];
    shortages?: { requested: number; available: number }[];
  };
  observation?: Observation;
  answer?: boolean;
  announceSave?: boolean;
  stateChanged?: boolean;
};
export type Reply = {
  text: string;
  hint?: string;
  waitForAction?: boolean;
  unique?: boolean;
  verification?: boolean;
};
export type LessonEffect = {
  hint?: string;
  complete?: boolean;
  completionMessage?: string;
  started?: boolean;
  replies?: Reply[];
  catalogReads?: number;
  lastCatalog?: string;
  rejectionSeen?: boolean;
  observation?: Observation;
  quizWrong?: boolean;
  entryState?: ShopState;
};
export const LessonState = Annotation.Root({
  input: Annotation<LessonInput>(),
  prompt: Annotation<{ text: string; hint?: string; action?: string }>(),
  satisfied: Annotation<boolean>(),
  operation: Annotation<WorkflowResult>(),
  effect: Annotation<LessonEffect>({
    default: () => ({}),
    reducer: (current, update) => ({
      ...current,
      ...update,
      replies: [...(current.replies ?? []), ...(update.replies ?? [])],
    }),
  }),
});
export type State = typeof LessonState.State;

// These nodes expose the current actor and instruction. They do not append chat
// messages: the browser presents this script with its existing user-action pacing.
export const explain = (lesson: LessonPhase) => () => ({
  prompt: {
    text: [lesson.introduction, lesson.explanation].filter(Boolean).join(" "),
  },
});
export const propose =
  (lesson: LessonPhase) =>
  async ({ input }: State, config?: RunnableConfig) => ({
    prompt: {
      text: lesson.preparation!,
      action: "approve",
      hint: lesson.approval,
    },
    ...(input.event === "preview"
      ? { operation: await tools(config).preview(lesson.id) }
      : {}),
  });
function tools(config?: RunnableConfig): LessonOperations {
  const operations = config?.configurable?.operations as
    LessonOperations | undefined;
  if (!operations)
    throw new Error("This lesson action requires workspace tools.");
  return operations;
}
export const apply =
  (lesson: LessonPhase) =>
  async ({ input }: State, config?: RunnableConfig) => {
    if (input.event !== "prepare") return {};
    if (!input.revision)
      throw new Error("Review the proposed diff before applying changes.");
    const operation = await tools(config).prepare(lesson.id, input.revision);
    return { operation, input: { ...input, prepared: operation.ok } };
  };
export const checkSaved =
  (lesson: LessonPhase) =>
  async ({ input }: State, config?: RunnableConfig) => {
    if (input.event !== "check") return {};
    const operation = await tools(config).check(
      lesson.id === "context-repl" ? "connect" : lesson.id,
    );
    return { operation, input: { ...input, ready: operation.ok } };
  };
export const instruct = (lesson: LessonPhase) => () => ({
  prompt: {
    text: lesson.instruction,
    hint: lesson.hint,
    action: lesson.check ? "save" : "experiment",
  },
});
export const verified =
  (lesson: LessonPhase) =>
  ({ input }: State) => ({
    prompt: {
      text: lesson.verification ?? lesson.instruction,
      hint: lesson.verificationHint ?? lesson.hint,
      action: "experiment",
    },
    effect:
      input.event === "poll" && input.announceSave && lesson.verification
        ? {
            replies: [
              {
                text: lesson.verification,
                hint: lesson.verificationHint,
                waitForAction: true,
                verification: true,
              },
            ],
          }
        : {},
  });
export const complete = () => ({ effect: { complete: true } });
export const stock = (input: LessonInput) =>
  Object.fromEntries(
    input.products.map((product) => [product.id, product.stock]),
  );
export const equal = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);
export const accepted = (input: LessonInput) =>
  input.event === "order" &&
  input.status === 201 &&
  equal(input.response?.items, input.items);
export function purchaseObservation(
  input: LessonInput,
): Observation | undefined {
  const quantity = (input.items ?? [])
    .filter((item) => item.productId === "dark-roast")
    .reduce((sum, item) => sum + item.quantity, 0);
  const before = input.before?.["dark-roast"],
    after = stock(input)["dark-roast"];
  if (
    accepted(input) &&
    quantity > 0 &&
    before !== undefined &&
    after !== undefined
  )
    return { before, after, quantity };
}

// The HTTP boundary validates receipts before the graph reads them. Source
// validation still runs in isolated snapshots; receipts describe observations.
export function emptyInput(): LessonInput {
  return {
    event: "poll",
    prepared: false,
    ready: false,
    products: [],
    state: { catalog: null, inventory: null },
    baseline: [],
    cartSize: 0,
    catalogReads: 0,
    lastCatalog: "",
    rejectionSeen: false,
  };
}
