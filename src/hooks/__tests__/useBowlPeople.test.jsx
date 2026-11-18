import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({ state: { rpc: null } }));

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [{ user_id: "u1", role: "owner" }], error: null }),
      }),
    }),
    rpc: (...args) => state.rpc(...args),
  },
}));

import useBowlPeople from "../useBowlPeople";

describe("useBowlPeople", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("names the roster from the profile directory", async () => {
    state.rpc = () => Promise.resolve({ data: [{ user_id: "u1", display_name: "Scott" }], error: null });
    const { result } = renderHook(() => useBowlPeople("b1", { enabled: true }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.members).toEqual([{ userId: "u1", role: "owner", displayName: "Scott" }]);
  });

  it("reads again when asked to refresh, showing the last answer meanwhile", async () => {
    let names = [{ user_id: "u1", display_name: "Scott" }];
    state.rpc = vi.fn(() => Promise.resolve({ data: names, error: null }));
    const { result, rerender } = renderHook(
      ({ refreshKey }) => useBowlPeople("b1", { enabled: true, refreshKey }),
      { initialProps: { refreshKey: 1 } }
    );
    await waitFor(() => expect(result.current.members[0]?.displayName).toBe("Scott"));
    names = [{ user_id: "u1", display_name: "Scotty" }];
    rerender({ refreshKey: 2 });
    expect(result.current.members[0].displayName).toBe("Scott");
    await waitFor(() => expect(result.current.members[0].displayName).toBe("Scotty"));
    expect(state.rpc).toHaveBeenCalledTimes(2);
  });

  it("lands in the error state when a read throws instead of rejecting unhandled", async () => {
    state.rpc = () => {
      throw new Error("offline");
    };
    const { result } = renderHook(() => useBowlPeople("b1", { enabled: true }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.members).toEqual([]);
  });
});
