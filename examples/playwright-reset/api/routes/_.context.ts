import type { Store } from "../_.store.js";

export class Context {
  public readonly store: Store;

  public constructor({ store }: { store: Store }) {
    this.store = store;
  }
}
