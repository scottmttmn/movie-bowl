import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  remainingQueue: [],
  watchedQueue: [],
  updatePayloads: [],
  updateEqFilters: [],
  fetchStreamingProviders: vi.fn(),
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: "user-1" } } },
        error: null,
      })),
    },
    from: vi.fn((table) => {
      if (table !== "bowl_movies") {
        throw new Error(`Unexpected table: ${table}`);
      }

      const state = { mode: "select", kind: null };
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((key, value) => {
          if (state.mode === "update") {
            mocks.updateEqFilters.push({ key, value });
          }
          return query;
        }),
        is: vi.fn((column, value) => {
          if (column === "drawn_at" && value === null) state.kind = "remaining";
          return query;
        }),
        not: vi.fn((column, op, value) => {
          if (column === "drawn_at" && op === "is" && value === null) state.kind = "watched";
          return query;
        }),
        order: vi.fn(async () => {
          if (state.kind === "remaining") {
            return {
              data: mocks.remainingQueue.shift() || [],
              error: null,
            };
          }

          if (state.kind === "watched") {
            return {
              data: mocks.watchedQueue.shift() || [],
              error: null,
            };
          }

          return { data: [], error: null };
        }),
        update: vi.fn((payload) => {
          state.mode = "update";
          mocks.updatePayloads.push(payload);
          return query;
        }),
        then: (resolve) => resolve({ data: null, error: null }),
      };

      return query;
    }),
  },
}));

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));
vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: mocks.fetchStreamingProviders,
}));

import useBowl from "../useBowl";

describe("useBowl handleDraw integration", () => {
  beforeEach(() => {
    mocks.remainingQueue = [];
    mocks.watchedQueue = [];
    mocks.updatePayloads = [];
    mocks.updateEqFilters = [];
    mocks.fetchStreamingProviders.mockReset();
    mocks.supabase.from.mockClear();
  });

  it("updates DB and refreshes bowl state after draw", async () => {
    const movie = { id: "m1", tmdb_id: 101, title: "Movie A" };
    const watchedMovie = {
      ...movie,
      drawn_at: "2026-02-23T00:00:00.000Z",
      drawn_by: "user-1",
    };

    mocks.remainingQueue.push([movie], []);
    mocks.watchedQueue.push([], [watchedMovie]);
    mocks.fetchStreamingProviders.mockResolvedValue({
      providers: ["Netflix"],
      region: "US",
      fetchedAt: "2026-02-23T00:00:00.000Z",
    });

    const { result } = renderHook(() => useBowl("bowl-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.bowl.remaining).toHaveLength(1);

    let drawn;
    await act(async () => {
      drawn = await result.current.handleDraw();
    });

    expect(drawn.id).toBe("m1");
    expect(drawn.streamingProviders).toEqual(["Netflix"]);
    expect(mocks.updatePayloads).toHaveLength(1);
    expect(mocks.updatePayloads[0].drawn_by).toBe("user-1");
    expect(typeof mocks.updatePayloads[0].drawn_at).toBe("string");
    expect(mocks.updateEqFilters).toEqual(
      expect.arrayContaining([
        { key: "id", value: "m1" },
        { key: "bowl_id", value: "bowl-1" },
      ])
    );

    await waitFor(() => {
      expect(result.current.bowl.remaining).toHaveLength(0);
      expect(result.current.bowl.watched).toHaveLength(1);
      expect(result.current.bowl.watched[0].id).toBe("m1");
    });
  });

  it("prioritizes titles matching user streaming services", async () => {
    const movieA = { id: "m1", tmdb_id: 101, title: "Movie A" };
    const movieB = { id: "m2", tmdb_id: 202, title: "Movie B" };
    const watchedMovieB = {
      ...movieB,
      drawn_at: "2026-02-23T00:00:00.000Z",
      drawn_by: "user-1",
    };

    mocks.remainingQueue.push([movieA, movieB], [movieA]);
    mocks.watchedQueue.push([], [watchedMovieB]);
    mocks.fetchStreamingProviders.mockImplementation(async (tmdbId) => {
      if (tmdbId === 101) return { providers: ["Max"], region: "US", fetchedAt: null };
      return { providers: ["Netflix"], region: "US", fetchedAt: null };
    });

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const { result } = renderHook(() => useBowl("bowl-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let drawn;
    await act(async () => {
      drawn = await result.current.handleDraw({
        prioritizeByServices: true,
        userStreamingServices: ["Netflix"],
      });
    });

    expect(drawn.id).toBe("m2");
    expect(mocks.fetchStreamingProviders).toHaveBeenCalledWith(101, { region: "US" });
    expect(mocks.fetchStreamingProviders).toHaveBeenCalledWith(202, { region: "US" });
    expect(mocks.updateEqFilters).toEqual(
      expect.arrayContaining([
        { key: "id", value: "m2" },
        { key: "bowl_id", value: "bowl-1" },
      ])
    );

    randomSpy.mockRestore();
  });
});
