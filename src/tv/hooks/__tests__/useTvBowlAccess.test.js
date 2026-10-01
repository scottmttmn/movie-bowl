import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: { countRows: [], countError: null, countThrows: false },
}));

vi.mock("../../../lib/supabase", () => {
  const bowlQuery = {
    select: () => bowlQuery,
    eq: () => bowlQuery,
    single: async () => ({
      data: { name: "Family Night", owner_id: "user-1", draw_access_mode: "all_members", draw_method: "rotation" },
      error: null,
    }),
  };
  return {
    supabase: {
      from: () => bowlQuery,
      rpc: async (name) => {
        if (name !== "get_my_bowls_with_counts") throw new Error(`unexpected rpc ${name}`);
        if (mocks.state.countThrows) throw new Error("network down");
        return { data: mocks.state.countRows, error: mocks.state.countError };
      },
    },
  };
});

import { useTvBowlAccess } from "../useTvBowls";

describe("useTvBowlAccess", () => {
  beforeEach(() => {
    mocks.state.countRows = [];
    mocks.state.countError = null;
    mocks.state.countThrows = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("carries the bowl's member count, the number the bowl list shows", async () => {
    mocks.state.countRows = [
      { id: "other", member_count: 9 },
      { id: "bowl-1", member_count: 3 },
    ];

    const { result } = renderHook(() => useTvBowlAccess("bowl-1", "user-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.bowlMeta).toMatchObject({ canDraw: true, drawMethod: "rotation", memberCount: 3 });
  });

  it("still opens the bowl when the count cannot be read", async () => {
    mocks.state.countThrows = true;

    const { result } = renderHook(() => useTvBowlAccess("bowl-1", "user-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.bowlMeta).toMatchObject({ canDraw: true, memberCount: null });
  });

  it("drops the count rather than inventing one when the bowl is not listed", async () => {
    mocks.state.countError = { message: "denied" };

    const { result } = renderHook(() => useTvBowlAccess("bowl-1", "user-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.bowlMeta.memberCount).toBeNull();
  });
});
