import { EventEmitter } from "node:events";

export async function waitForEvent(
  target: EventEmitter | EventTarget,
  eventName: string,
): Promise<unknown> {
  return await new Promise((resolve) => {
    const handler = (event: unknown) => {
      if (target instanceof EventTarget) {
        target.removeEventListener(eventName, handler);
      }

      resolve(event);
    };

    if (target instanceof EventEmitter) {
      target.once(eventName, handler);
    } else {
      target.addEventListener(eventName, handler);
    }
  });
}
