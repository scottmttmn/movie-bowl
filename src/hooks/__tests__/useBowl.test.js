import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  remainingQueue: [],
  watchedQueue: [],
  insertPayloads: [],
  insertResponses: [],
  updatePayloads: [],
  updateEqFilters: [],
  deleteEqFilters: [],
  deleteCalled: false,
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
          if (state.mode === "delete") {
            mocks.deleteEqFilters.push({ key, value });
          }
          return query;
        }),
        is: vi.fn((column, value) => {
          if (column === "drawn_at" && value === null) state.kind = "remaining";
          if (state.mode === "update") {
            mocks.updateEqFilters.push({ key: column, value });
          }
          if (state.mode === "delete") {
            mocks.deleteEqFilters.push({ key: column, value });
          }
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
        insert: vi.fn((payload) => {
          mocks.insertPayloads.push(payload);
          const nextResponse = mocks.insertResponses.shift();
          if (nextResponse) {
            return Promise.resolve(nextResponse);
          }
          return Promise.resolve({ data: payload, error: null });
        }),
        delete: vi.fn(() => {
          state.mode = "delete";
          mocks.deleteCalled = true;
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
    mocks.insertPayloads = [];
    mocks.insertResponses = [];
    mocks.updatePayloads = [];
    mocks.updateEqFilters = [];
    mocks.deleteEqFilters = [];
    mocks.deleteCalled = false;
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
        { key: "bowl_id", value: "bowl-1" },
        { key: "drawn_at", value: null },
        { key: "tmdb_id", value: 101 },
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
        { key: "bowl_id", value: "bowl-1" },
        { key: "drawn_at", value: null },
        { key: "tmdb_id", value: 202 },
      ])
    );

    randomSpy.mockRestore();
  });

  it("deletes only current user's undrawn movie and refreshes state", async () => {
    const movie = { id: "m1", tmdb_id: 101, title: "Movie A", added_by: "user-1" };

    mocks.remainingQueue.push([movie], []);
    mocks.watchedQueue.push([], []);

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.bowl.remaining).toHaveLength(1);

    let deleted;
    await act(async () => {
      deleted = await result.current.handleDeleteMovie("m1");
    });

    expect(deleted).toBe(true);
    expect(mocks.deleteCalled).toBe(true);
    expect(mocks.deleteEqFilters).toEqual(
      expect.arrayContaining([
        { key: "id", value: "m1" },
        { key: "bowl_id", value: "bowl-1" },
        { key: "added_by", value: "user-1" },
        { key: "drawn_at", value: null },
      ])
    );

    await waitFor(() => {
      expect(result.current.bowl.remaining).toHaveLength(0);
    });
  });

  it("allows adding custom entries without a TMDB id", async () => {
    mocks.remainingQueue.push([], []);
    mocks.watchedQueue.push([], []);

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleAddMovie({
        title: "Wildcard",
        genres: [],
      });
    });

    expect(mocks.insertPayloads).toHaveLength(1);
    expect(mocks.insertPayloads[0][0]).toEqual(
      expect.objectContaining({
        bowl_id: "bowl-1",
        added_by: "user-1",
        tmdb_id: null,
        title: "Wildcard",
      })
    );
  });

  it("retries custom add with synthetic tmdb id when null tmdb_id is rejected", async () => {
    mocks.remainingQueue.push([], []);
    mocks.watchedQueue.push([], []);
    mocks.insertResponses.push(
      { data: null, error: { message: 'null value in column "tmdb_id"' } },
      { data: [{ id: "row-1" }], error: null }
    );

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleAddMovie({
        title: "Wildcard",
        genres: [],
      });
    });

    expect(mocks.insertPayloads).toHaveLength(2);
    expect(mocks.insertPayloads[0][0].tmdb_id).toBeNull();
    expect(mocks.insertPayloads[1][0].tmdb_id).toEqual(expect.any(Number));
    expect(mocks.insertPayloads[1][0].tmdb_id).toBeLessThan(0);
  });

  it("draw marks all duplicate TMDB instances as drawn", async () => {
    const movie1 = { id: "m1", tmdb_id: 101, title: "Movie A" };
    const movie2 = { id: "m2", tmdb_id: 101, title: "Movie A" };

    mocks.remainingQueue.push([movie1, movie2], []);
    mocks.watchedQueue.push([], [
      { ...movie1, drawn_at: "2026-02-23T00:00:00.000Z", drawn_by: "user-1" },
      { ...movie2, drawn_at: "2026-02-23T00:00:00.000Z", drawn_by: "user-1" },
    ]);
    mocks.fetchStreamingProviders.mockResolvedValue({
      providers: ["Netflix"],
      region: "US",
      fetchedAt: "2026-02-23T00:00:00.000Z",
    });

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleDraw();
    });

    expect(mocks.updateEqFilters).toEqual(
      expect.arrayContaining([
        { key: "bowl_id", value: "bowl-1" },
        { key: "drawn_at", value: null },
        { key: "tmdb_id", value: 101 },
      ])
    );

    await waitFor(() => {
      expect(result.current.bowl.remaining).toHaveLength(0);
      expect(result.current.bowl.watched).toHaveLength(2);
    });

    randomSpy.mockRestore();
  });

  it("re-adding watched TMDB title inserts a new remaining row when duplicates are allowed", async () => {
    const watchedMovie = {
      id: "w1",
      tmdb_id: 101,
      title: "Movie A",
      drawn_at: "2026-02-23T00:00:00.000Z",
      drawn_by: "user-2",
    };
    const newRemainingRow = {
      id: "n1",
      tmdb_id: 101,
      title: "Movie A",
      drawn_at: null,
      drawn_by: null,
    };

    mocks.remainingQueue.push([], [newRemainingRow]);
    mocks.watchedQueue.push([watchedMovie], [watchedMovie]);

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.bowl.watched).toHaveLength(1);

    await act(async () => {
      await result.current.handleAddMovie({
        id: 101,
        title: "Movie A",
        genres: [],
      });
    });

    expect(mocks.insertPayloads).toHaveLength(1);
    expect(mocks.updatePayloads).toHaveLength(0);

    await waitFor(() => {
      expect(result.current.bowl.remaining).toHaveLength(1);
      expect(result.current.bowl.watched).toHaveLength(1);
    });
  });

  it("re-adding watched custom entry inserts a new remaining row when duplicates are allowed", async () => {
    const watchedCustom = {
      id: "c1",
      tmdb_id: -1234,
      title: "Wildcard",
      drawn_at: "2026-02-23T00:00:00.000Z",
      drawn_by: "user-2",
    };
    const newRemainingCustom = {
      id: "n-custom",
      tmdb_id: -1234,
      title: "Wildcard",
      drawn_at: null,
      drawn_by: null,
    };

    mocks.remainingQueue.push([], [newRemainingCustom]);
    mocks.watchedQueue.push([watchedCustom], [watchedCustom]);

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.bowl.watched).toHaveLength(1);

    await act(async () => {
      await result.current.handleAddMovie({
        title: "Wildcard",
        genres: [],
      });
    });

    expect(mocks.insertPayloads).toHaveLength(1);
    expect(mocks.updatePayloads).toHaveLength(0);

    await waitFor(() => {
      expect(result.current.bowl.remaining).toHaveLength(1);
      expect(result.current.bowl.watched).toHaveLength(1);
    });
  });

  it("allows adding a duplicate active TMDB title when duplicates are enabled", async () => {
    const existingRemaining = {
      id: "r1",
      tmdb_id: 101,
      title: "Movie A",
      drawn_at: null,
      drawn_by: null,
    };
    const duplicateRemaining = {
      id: "r2",
      tmdb_id: 101,
      title: "Movie A",
      drawn_at: null,
      drawn_by: null,
    };

    mocks.remainingQueue.push([existingRemaining], [existingRemaining, duplicateRemaining]);
    mocks.watchedQueue.push([], []);

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.bowl.remaining).toHaveLength(1);

    await act(async () => {
      await result.current.handleAddMovie({ id: 101, title: "Movie A", genres: [] });
    });

    expect(mocks.insertPayloads).toHaveLength(1);
    expect(mocks.updatePayloads).toHaveLength(0);
    await waitFor(() => {
      expect(result.current.bowl.remaining).toHaveLength(2);
    });
  });
});
