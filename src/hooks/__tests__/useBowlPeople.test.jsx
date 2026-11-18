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

  it("lands in the error state when a read throws instead of rejecting unhandled", async () => {
    state.rpc = () => {
      throw new Error("offline");
    };
    const { result } = renderHook(() => useBowlPeople("b1", { enabled: true }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.members).toEqual([]);
  });
});
