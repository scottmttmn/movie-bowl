import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useWhoIsHere from "../useWhoIsHere";
import { AWAY_TTL_MS } from "../../utils/whoIsHere";

describe("useWhoIsHere", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("forgets an absence when the page comes back after the evening is over", () => {
    vi.useFakeTimers({ now: new Date("2026-11-20T01:00:00Z") });
    const { result } = renderHook(() => useWhoIsHere({ bowlId: "b1", userId: "me" }));
    act(() => result.current.toggleAway("user:casey"));
    expect(result.current.awayKeys).toEqual(["user:casey"]);

    vi.setSystemTime(Date.now() + AWAY_TTL_MS + 1000);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(result.current.awayKeys).toEqual([]);
  });

  it("keeps each bowl's room to itself", () => {
    const { result, rerender } = renderHook(({ bowlId }) => useWhoIsHere({ bowlId, userId: "me" }), {
      initialProps: { bowlId: "b1" },
    });
    act(() => result.current.toggleAway("user:casey"));
    act(() => result.current.setSkipAsk(true));
    rerender({ bowlId: "b2" });
    expect(result.current.awayKeys).toEqual([]);
    expect(result.current.skipAsk).toBe(false);
    rerender({ bowlId: "b1" });
    expect(result.current.awayKeys).toEqual(["user:casey"]);
    expect(result.current.skipAsk).toBe(true);
  });
});
