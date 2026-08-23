import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useOnlineStatus from "../useOnlineStatus";

function setOnLine(value) {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(value);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useOnlineStatus", () => {
  it("starts from the browser's current state", () => {
    setOnLine(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it("tracks the connection dropping and returning", () => {
    setOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    setOnLine(false);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(result.current).toBe(false);

    setOnLine(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect(result.current).toBe(true);
  });

  it("stops listening once unmounted", () => {
    setOnLine(true);
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useOnlineStatus());

    unmount();

    const removed = removeSpy.mock.calls.map(([eventName]) => eventName);
    expect(removed).toContain("online");
    expect(removed).toContain("offline");
  });
});
