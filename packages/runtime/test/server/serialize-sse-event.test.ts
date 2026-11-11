import { serializeSseEvent } from "../../src/server/serialize-sse-event.js";

describe("explicit SSE frames", () => {
  it("formats named events, ids, retry intervals, and multiline data", () => {
    expect(
      serializeSseEvent({
        event: "update",
        id: "2",
        retry: 1500,
        data: "one\r\ntwo\rthree\nfour\n",
      }),
    ).toBe(
      "event: update\nid: 2\ndata: one\ndata: two\ndata: three\ndata: four\ndata: \nretry: 1500\n\n",
    );
  });

  it("supports heartbeat comments, empty data, and resetting the event id", () => {
    expect(serializeSseEvent({ comment: "alive\nnext" })).toBe(
      ": alive\n: next\n\n",
    );
    expect(serializeSseEvent({ id: "", data: "", retry: 0 })).toBe(
      "id: \ndata: \nretry: 0\n\n",
    );
  });

  it("sends serialized JSON text and Unicode without quoting it again", () => {
    expect(serializeSseEvent({ data: '{"message":"こんにちは"}' })).toBe(
      'data: {"message":"こんにちは"}\n\n',
    );
  });

  it.each([
    null,
    "hello",
    { data: 5 },
    { event: "ok\ndata: injected" },
    { id: "ok\rretry: 0" },
    { id: "bad\0id" },
    { retry: -1 },
    { retry: 1.5 },
    { retry: Infinity },
    { retry: Number.MAX_SAFE_INTEGER + 1 },
    { retry: "100" },
  ])("rejects invalid frames before serializing their fields: %p", (frame) => {
    expect(() => serializeSseEvent(frame)).toThrow(TypeError);
  });
});
