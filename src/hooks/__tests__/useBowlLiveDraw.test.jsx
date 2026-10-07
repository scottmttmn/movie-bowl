import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = { channels: [] };
  const makeChannel = (topic, options) => {
    const handlers = { presence: [], broadcast: [] };
    const channel = {
      topic,
      options,
      presence: {},
      tracked: [],
      sent: [],
      on: vi.fn((type, filter, handler) => {
        handlers[type].push({ filter, handler });
        return channel;
      }),
      subscribe: vi.fn((callback) => {
        channel.statusCallback = callback;
        return channel;
      }),
      track: vi.fn((meta) => channel.tracked.push(meta)),
      untrack: vi.fn(() => channel.tracked.push(null)),
      send: vi.fn((message) => {
        channel.sent.push(message);
        return Promise.resolve("ok");
      }),
      presenceState: () => channel.presence,
      emitPresence(next) {
        channel.presence = next;
        handlers.presence.forEach(({ handler }) => handler());
      },
      emitDraw(payload) {
        handlers.broadcast.forEach(({ filter, handler }) => {
          if (filter.event === "draw") handler({ payload });
        });
      },
    };
    return channel;
  };
  return {
    state,
    supabase: {
      channel: vi.fn((topic, options) => {
        const channel = makeChannel(topic, options);
        state.channels.push(channel);
        return channel;
      }),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));

import useBowlLiveDraw from "../useBowlLiveDraw";
import { buildLiveDraw } from "../../utils/liveDraw";

const latest = () => mocks.state.channels.at(-1);

describe("useBowlLiveDraw", () => {
  beforeEach(() => {
    mocks.state.channels = [];
    mocks.supabase.channel.mockClear();
    mocks.supabase.removeChannel.mockClear();
  });
  afterEach(cleanup);

  it("joins the bowl's private channel and leaves it with the bowl", () => {
    const { rerender, unmount } = renderHook((props) => useBowlLiveDraw(props), {
      initialProps: { bowlId: "b1" },
    });
    expect(latest().topic).toBe("bowl-live:b1");
    expect(latest().options).toEqual({ config: { private: true, broadcast: { self: false } } });

    const first = latest();
    rerender({ bowlId: "b2" });
    expect(mocks.supabase.removeChannel).toHaveBeenCalledWith(first);
    expect(latest().topic).toBe("bowl-live:b2");

    unmount();
    expect(mocks.supabase.removeChannel).toHaveBeenCalledTimes(2);
  });

  it("lights up on a phone only while a television is listening", () => {
    const { result } = renderHook(() => useBowlLiveDraw({ bowlId: "b1" }));
    act(() => latest().statusCallback("SUBSCRIBED"));
    expect(result.current.televisionPresent).toBe(false);

    act(() => latest().emitPresence({ k1: [{ surface: "tv" }] }));
    expect(result.current.televisionPresent).toBe(true);

    act(() => latest().emitPresence({}));
    expect(result.current.televisionPresent).toBe(false);
  });

  it("goes dark when the channel fails, and does not track from a phone", () => {
    const { result } = renderHook(() => useBowlLiveDraw({ bowlId: "b1" }));
    act(() => latest().statusCallback("SUBSCRIBED"));
    act(() => latest().emitPresence({ k1: [{ surface: "tv" }] }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => latest().statusCallback("CHANNEL_ERROR", new Error("denied")));
    expect(result.current.televisionPresent).toBe(false);
    expect(latest().track).not.toHaveBeenCalled();
  });

  it("has a television say it is listening only while it can pick a draw up", () => {
    const { rerender, result } = renderHook((props) => useBowlLiveDraw(props), {
      initialProps: { bowlId: "b1", surface: "tv", available: true },
    });
    act(() => latest().statusCallback("SUBSCRIBED"));
    expect(latest().tracked).toEqual([{ surface: "tv" }]);

    rerender({ bowlId: "b1", surface: "tv", available: false });
    expect(latest().untrack).toHaveBeenCalledTimes(1);
    rerender({ bowlId: "b1", surface: "tv", available: true });
    expect(latest().tracked).toEqual([{ surface: "tv" }, null, { surface: "tv" }]);

    // A television never counts itself as one to play on.
    act(() => latest().emitPresence({ k1: [{ surface: "tv" }] }));
    expect(result.current.televisionPresent).toBe(false);
  });

  it("hands on draws it can read and sends its own once joined", async () => {
    const onDraw = vi.fn();
    const { result } = renderHook(() => useBowlLiveDraw({ bowlId: "b1", onDraw }));
    const draw = buildLiveDraw({ bowlMovieId: "m1", title: "Heat", methodId: "title_first", drawnBy: "Robin" });

    // Not joined yet: nothing goes out.
    act(() => result.current.announceDraw(draw));
    expect(latest().send).not.toHaveBeenCalled();

    act(() => latest().statusCallback("SUBSCRIBED"));
    await act(async () => result.current.announceDraw(draw));
    expect(latest().sent).toEqual([{ type: "broadcast", event: "draw", payload: draw }]);

    act(() => latest().emitDraw(draw));
    act(() => latest().emitDraw({ v: 99, bowlMovieId: "m2" }));
    expect(onDraw).toHaveBeenCalledTimes(1);
    expect(onDraw).toHaveBeenCalledWith(expect.objectContaining({ bowlMovieId: "m1", drawnBy: "Robin" }));
  });
});
