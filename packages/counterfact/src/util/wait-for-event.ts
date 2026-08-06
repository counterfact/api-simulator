import { EventEmitter } from "node:events";

/**
 * Creates a promise that resolves when a specified event is fired on the given EventTarget.
 * @param {EventTarget | EventEmitter} target - The target to listen for the event on.
 * @param {string} eventName - The name of the event to listen for.
 * @returns {Promise<Event>} A promise that resolves with the event object when the event is fired.
 */
export async function waitForEvent(
  target: EventEmitter | EventTarget,
  eventName: string,
) {
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
