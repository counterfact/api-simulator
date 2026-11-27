/** An SSE frame. Data is already serialized text; comments can carry heartbeats. */
export interface SseEvent {
  comment?: string;
  data?: string;
  event?: string;
  id?: string;
  /** Reconnection delay in milliseconds, as a nonnegative safe integer. */
  retry?: number;
}
