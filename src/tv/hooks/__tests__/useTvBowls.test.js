import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: { homeResult: null, homeThrows: false, kindRows: [], kindError: null },
}));

vi.mock("../../../lib/supabase", () => ({
  supabase: {
    from: (table) => ({
      select: () => ({
        eq: async () => (table === "bowls"
          ? { data: [{ id: "family" }], error: null }
          : { data: [{ bowl_id: "friends" }], error: null }),
        in: async () => ({ data: mocks.state.kindRows, error: mocks.state.kindError }),
      }),
    }),
    rpc: async (name) => {
      if (name === "get_my_bowls_with_counts") {
        return {
          data: [
            { id: "family", name: "Family Night", owner_id: "user-1", remaining_count: 12, member_count: 4 },
            { id: "friends", name: "Friday Friends", owner_id: "user-2", remaining_count: 8, member_count: 6 },
          ],
          error: null,
        };
      }
      if (name === "get_my_bowl_context") {
        if (mocks.state.homeThrows) throw new Error("network down");
        return mocks.state.homeResult;
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  },
}));

import { useTvBowls } from "../useTvBowls";

describe("useTvBowls", () => {
  beforeEach(() => {
    mocks.state.homeResult = { data: { default_bowl_id: "friends", bowls: [] }, error: null };
    mocks.state.homeThrows = false;
    mocks.state.kindRows = [{ id: "family", kind: "movies" }, { id: "friends", kind: "movies" }];
    mocks.state.kindError = null;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("names the account's home bowl beside the list", async () => {
    const { result } = renderHook(() => useTvBowls("user-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.bowls.map((bowl) => bowl.id)).toEqual(["family", "friends"]);
    expect(result.current.homeBowlId).toBe("friends");
  });

  // The house is a mark, so losing it must not cost the room its bowls.
  it("still lists the bowls when the home bowl cannot be read", async () => {
    for (const fail of [
      () => { mocks.state.homeThrows = true; },
      () => { mocks.state.homeResult = { data: null, error: { message: "denied" } }; },
    ]) {
      fail();
      const { result, unmount } = renderHook(() => useTvBowls("user-1"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.errorMessage).toBeNull();
      expect(result.current.bowls).toHaveLength(2);
      expect(result.current.homeBowlId).toBeNull();
      unmount();
    }
  });

  it("leaves restaurant bowls off the television, even when the account context fails", async () => {
    mocks.state.kindRows = [{ id: "family", kind: "movies" }, { id: "friends", kind: "restaurants" }];
    for (const context of [
      () => { mocks.state.homeResult = { data: { default_bowl_id: "family", bowls: [] }, error: null }; },
      () => { mocks.state.homeThrows = true; },
    ]) {
      context();
      const { result, unmount } = renderHook(() => useTvBowls("user-1"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.bowls.map((bowl) => bowl.id)).toEqual(["family"]);
      unmount();
    }
  });

  // Without the kinds the list cannot tell a restaurant bowl from a movie one.
  it("fails the list rather than guess when the kinds cannot be read", async () => {
    mocks.state.kindError = { message: "denied" };
    const { result } = renderHook(() => useTvBowls("user-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.bowls).toEqual([]);
    expect(result.current.errorMessage).toBe("Movie Bowl could not load your bowls. Try again.");
  });
});
