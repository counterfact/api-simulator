/** Serializes watch updates and holds new events during explicit reconstruction. */
export class UpdateQueue {
  private tail: Promise<void> = Promise.resolve();

  public run(operation: () => Promise<void>): Promise<void> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }

  /** Drains received events, then holds subsequent updates until released. */
  public async pause(): Promise<() => void> {
    const previous = this.tail;
    let resume!: () => void;
    const held = new Promise<void>((resolve) => {
      resume = resolve;
    });
    this.tail = previous.then(() => held);
    await previous;
    return resume;
  }
}
