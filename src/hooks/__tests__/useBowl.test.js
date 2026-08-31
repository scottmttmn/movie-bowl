import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  remainingQueue: [],
  lastRemaining: [],
  watchedQueue: [],
  profileDirectoryRows: [],
  profileDirectoryError: null,
  filterMetadataRows: [],
  filterMetadataError: null,
  rpcCalls: [],
  rpcResponses: [],
  selectCalls: [],
  insertPayloads: [],
  insertResponses: [],
  updatePayloads: [],
  updateResponses: [],
  updateEqFilters: [],
  deleteEqFilters: [],
  deleteInFilters: [],
  deleteCalled: false,
  fetchStreamingProviders: vi.fn(),
  getTmdbMovieDetails: vi.fn(),
  fetchMovieFilterMetadata: vi.fn(),
  warmTmdbMovieFilterMetadata: vi.fn(),
  fetchProviderLinks: vi.fn(),
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: "user-1" }, access_token: "access-token" } },
        error: null,
      })),
    },
    rpc: vi.fn(async (name, params) => {
      mocks.rpcCalls.push({ name, params });
      if (name === "get_my_bowl_context") return { data: { default_bowl_id: "bowl-1", bowls: [{ id: "bowl-1" }] }, error: null };
      if (name === "get_bowl_profile_directory") {
        return {
          data: mocks.profileDirectoryRows,
          error: mocks.profileDirectoryError,
        };
      }
      if (name === "get_bowl_filter_metadata") {
        return {
          data: mocks.filterMetadataRows,
          error: mocks.filterMetadataError,
        };
      }
      return mocks.rpcResponses.shift() || { data: null, error: null };
    }),
    from: vi.fn((table) => {
      if (table !== "bowl_movies" && table !== "bowl_draw_events") {
        throw new Error(`Unexpected table: ${table}`);
      }

      const state = { mode: "select", kind: null, table };
      const query = {
        select: vi.fn((columns) => {
          mocks.selectCalls.push({ table, columns });
          return query;
        }),
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
          if (table === "bowl_movies" && column === "drawn_at" && value === null) {
            state.kind = "remaining";
          }
          if (table === "bowl_draw_events" && column === "returned_at" && value === null) {
            state.kind = "watched";
          }
          if (state.mode === "update") {
            mocks.updateEqFilters.push({ key: column, value });
          }
          if (state.mode === "delete") {
            mocks.deleteEqFilters.push({ key: column, value });
          }
          return query;
        }),
        not: vi.fn((column, op, value) => {
          if (table === "bowl_movies" && column === "drawn_at" && op === "is" && value === null) {
            state.kind = "watched";
          }
          return query;
        }),
        order: vi.fn(async () => {
          if (state.kind === "remaining") {
            return {
              data: (mocks.lastRemaining = await (mocks.remainingQueue.shift() ?? mocks.lastRemaining)),
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
          const response =
            nextResponse ||
            {
              data: {
                ...payload[0],
                id: `ins-${mocks.insertPayloads.length}`,
                added_at: payload[0]?.snapshot_at || "2026-01-01T00:00:00.000Z",
                drawn_at: null,
                drawn_by: null,
              },
              error: null,
            };
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => response),
            })),
            then: (resolve, reject) => Promise.resolve(response).then(resolve, reject),
          };
        }),
        delete: vi.fn(() => {
          state.mode = "delete";
          mocks.deleteCalled = true;
          return query;
        }),
        in: vi.fn((key, values) => {
          if (state.mode === "delete") {
            mocks.deleteInFilters.push({ key, values });
          }
          return query;
        }),
        then: (resolve) => {
          if (state.mode === "update" && mocks.updateResponses.length > 0) {
            return resolve(mocks.updateResponses.shift());
          }
          return resolve({ data: null, error: null });
        },
      };

      return query;
    }),
  },
}));

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));
vi.mock("../../lib/providerLinks", () => ({ fetchProviderLinks: mocks.fetchProviderLinks }));
vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: mocks.fetchStreamingProviders,
}));
vi.mock("../../lib/tmdbApi", () => ({
  getTmdbMovieDetails: mocks.getTmdbMovieDetails,
  warmTmdbMovieFilterMetadata: mocks.warmTmdbMovieFilterMetadata,
}));
vi.mock("../../lib/movieFilterMetadata", () => ({
  fetchMovieFilterMetadata: mocks.fetchMovieFilterMetadata,
}));
vi.mock("../../utils/getBrowserTimeZone", () => ({
  getBrowserTimeZone: () => "America/Chicago",
}));

import useBowl from "../useBowl";
import { notifyBowlChange } from "../../lib/bowlChanges";
import { MAX_UNDRAWN_MOVIES_PER_BOWL } from "../../utils/appLimits";

function expectDrawRpc(movieId) {
  expect(mocks.rpcCalls).toContainEqual({
    name: "draw_bowl_movie",
    params: {
      p_bowl_movie_id: movieId,
      p_watched_timezone: "America/Chicago",
    },
  });
}

describe("useBowl handleDraw integration", () => {
  beforeEach(() => {
    mocks.fetchProviderLinks.mockReset().mockResolvedValue({ links: [] });
    mocks.remainingQueue = [];
    mocks.lastRemaining = [];
    mocks.watchedQueue = [];
    mocks.profileDirectoryRows = [];
    mocks.profileDirectoryError = null;
    mocks.filterMetadataRows = [];
    mocks.filterMetadataError = null;
    mocks.rpcCalls = [];
    mocks.rpcResponses = [];
    mocks.selectCalls = [];
    mocks.insertPayloads = [];
    mocks.insertResponses = [];
    mocks.updatePayloads = [];
    mocks.updateResponses = [];
    mocks.updateEqFilters = [];
    mocks.deleteEqFilters = [];
    mocks.deleteInFilters = [];
    mocks.deleteCalled = false;
    mocks.fetchStreamingProviders.mockReset();
    mocks.getTmdbMovieDetails.mockReset();
    mocks.fetchMovieFilterMetadata.mockReset();
    mocks.warmTmdbMovieFilterMetadata.mockReset();
    mocks.warmTmdbMovieFilterMetadata.mockResolvedValue(null);
    mocks.supabase.from.mockClear();
  });

  it("preserves a confirmed add over a refresh that began before it committed", async () => {
    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let finishRead;
    mocks.remainingQueue.push(new Promise((resolve) => { finishRead = resolve; }));
    let refresh;
    act(() => { refresh = result.current.reload(); });
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    const movie = { id: "new-slip", bowl_id: "bowl-1", title: "New Movie", added_by: "user-1", drawn_at: null };
    act(() => notifyBowlChange({ type: "add", phase: "success", userId: "user-1", bowlId: "bowl-1", submissionId: "new-slip", movie }));
    await act(async () => { finishRead([]); await refresh; });
    expect(result.current.bowl.remaining).toEqual([movie]);
    // A later read can legitimately remove it (for example, a remote draw).
    await act(async () => { await result.current.reload(); });
    expect(result.current.bowl.remaining).toEqual([]);
  });

  it("returns an add failure if the session lookup throws before dispatch", async () => {
    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mocks.supabase.auth.getSession.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    let added;
    await act(async () => { added = await result.current.handleAddMovie({ title: "Custom" }); });
    expect(added).toMatchObject({ ok: false, code: "add_failed" });
    expect(mocks.insertPayloads).toEqual([]);
    expect(result.current.errorMessage).toBe(added.message);
  });

  it("updates DB and refreshes bowl state after draw", async () => {
    const movie = {
      id: "m1",
      tmdb_id: 101,
      title: "Movie A",
      note: "Recommended by Tim.",
    };
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
    expect(drawn.note).toBe("Recommended by Tim.");
    expect(drawn.streamingProviders).toEqual(["Netflix"]);
    expectDrawRpc("m1");

    await waitFor(() => {
      expect(result.current.bowl.remaining).toHaveLength(0);
      expect(result.current.bowl.watched).toHaveLength(1);
      expect(result.current.bowl.watched[0].id).toBe("m1");
      expect(result.current.bowl.watched[0].note).toBe("Recommended by Tim.");
    });
    expect(mocks.selectCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "bowl_movies", columns: expect.stringContaining("note") }),
        expect.objectContaining({ table: "bowl_movies", columns: expect.stringContaining("is_pinned") }),
        expect.objectContaining({ table: "bowl_draw_events", columns: expect.stringContaining("note") }),
      ])
    );
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
    expectDrawRpc("m2");

    randomSpy.mockRestore();
  });

  it("draws from the whole bowl with one combined metadata request per title", async () => {
    const pgMovie = { id: "m-combined-pg", tmdb_id: 9301, title: "PG Netflix" };
    const rMovie = { id: "m-combined-r", tmdb_id: 9302, title: "R Max" };
    mocks.remainingQueue.push([pgMovie, rMovie], [pgMovie]);
    mocks.watchedQueue.push([], [{ ...rMovie, drawn_at: "2026-08-27T00:00:00.000Z" }]);
    mocks.fetchMovieFilterMetadata.mockImplementation(async (tmdbId) => ({
      details: {
        release_dates: {
          results: [{
            iso_3166_1: "US",
            release_dates: [{ certification: tmdbId === 9301 ? "PG" : "R" }],
          }],
        },
      },
      providers: tmdbId === 9301 ? ["Netflix"] : ["Max"],
      region: "US",
      fetchedAt: null,
    }));

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleDraw({
        ratingFilter: { allowedRatings: ["R"], includeUnknown: false },
        prioritizeByServices: true,
        prioritizeByServiceRank: true,
        userStreamingServices: ["Netflix", "Max"],
      });
    });

    expectDrawRpc("m-combined-r");
    expect(mocks.fetchMovieFilterMetadata).toHaveBeenCalledTimes(2);
    expect(mocks.getTmdbMovieDetails).not.toHaveBeenCalled();
    expect(mocks.fetchStreamingProviders).not.toHaveBeenCalled();
  });

  it("draws from one persistent bowl snapshot without live TMDB lookups", async () => {
    const netflixMovie = { id: "m-cache-netflix", tmdb_id: 9401, title: "PG Netflix" };
    const maxMovie = { id: "m-cache-max", tmdb_id: 9402, title: "R Max" };
    mocks.remainingQueue.push([netflixMovie, maxMovie], [netflixMovie]);
    mocks.watchedQueue.push([], [{ ...maxMovie, drawn_at: "2026-08-28T00:00:00.000Z" }]);
    mocks.filterMetadataRows = [
      {
        tmdb_id: 9401,
        region: "US",
        certification: "PG",
        providers: ["Netflix"],
        fetched_at: "2026-08-28T08:00:00.000Z",
      },
      {
        tmdb_id: 9402,
        region: "US",
        certification: "R",
        providers: ["Max"],
        fetched_at: "2026-08-28T08:00:00.000Z",
      },
    ];

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(result.current.filterMetadataFetchers.status).toBe("ready"));
    expect(
      mocks.rpcCalls.filter(({ name }) => name === "get_bowl_filter_metadata")
    ).toHaveLength(1);

    await act(async () => {
      await result.current.handleDraw({
        ratingFilter: { allowedRatings: ["R"], includeUnknown: false },
        prioritizeByServices: true,
        prioritizeByServiceRank: true,
        userStreamingServices: ["Netflix", "Max"],
      });
    });

    expectDrawRpc("m-cache-max");
    expect(mocks.fetchMovieFilterMetadata).not.toHaveBeenCalled();
    expect(mocks.getTmdbMovieDetails).not.toHaveBeenCalled();
    expect(mocks.fetchStreamingProviders).not.toHaveBeenCalled();
    expect(
      mocks.rpcCalls.filter(({ name }) => name === "get_bowl_filter_metadata")
    ).toHaveLength(2);
  });

  it("sends the resolved pool to the atomic rotation RPC and hydrates its selection", async () => {
    const movieA = { id: "m1", tmdb_id: 101, title: "Movie A", added_by: "user-1" };
    const movieB = { id: "m2", tmdb_id: 202, title: "Movie B", added_by: "user-2" };
    mocks.remainingQueue.push([movieA, movieB], [movieA]);
    mocks.watchedQueue.push([], [{ ...movieB, drawn_at: "2026-08-21T18:00:00.000Z" }]);
    mocks.rpcResponses.push({
      data: [{ bowl_movie_id: "m2", draw_event_id: "event-2" }],
      error: null,
    });
    mocks.fetchStreamingProviders.mockResolvedValue({
      providers: ["Netflix"],
      region: "US",
      fetchedAt: null,
    });

    const { result } = renderHook(() =>
      useBowl("bowl-1", { drawMethod: "rotation" })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let drawn;
    await act(async () => {
      drawn = await result.current.handleDraw();
    });

    expect(mocks.rpcCalls).toContainEqual({
      name: "draw_bowl_movie_by_rotation",
      params: {
        p_bowl_id: "bowl-1",
        p_candidate_movie_ids: ["m1", "m2"],
        p_watched_timezone: "America/Chicago",
      },
    });
    expect(mocks.rpcCalls.some(({ name }) => name === "draw_bowl_movie")).toBe(false);
    expect(mocks.fetchStreamingProviders).toHaveBeenCalledTimes(1);
    expect(mocks.fetchStreamingProviders).toHaveBeenCalledWith(202, { region: "US" });
    expect(drawn).toEqual(
      expect.objectContaining({ id: "m2", streamingProviders: ["Netflix"] })
    );
  });

  it("preserves the streaming fallback and manual titles in a rotation pool", async () => {
    const unmatched = { id: "m1", tmdb_id: 101, title: "Unmatched", added_by: "user-1" };
    const manual = { id: "manual", tmdb_id: -42, title: "Wildcard", added_by: "user-2" };
    mocks.remainingQueue.push([unmatched, manual], [unmatched]);
    mocks.watchedQueue.push([], [{ ...manual, drawn_at: "2026-08-21T18:00:00.000Z" }]);
    mocks.rpcResponses.push({
      data: [{ bowl_movie_id: "manual", draw_event_id: "event-manual" }],
      error: null,
    });
    mocks.fetchStreamingProviders.mockResolvedValue({
      providers: ["Paramount+"],
      region: "US",
      fetchedAt: null,
    });

    const { result } = renderHook(() =>
      useBowl("bowl-1", { drawMethod: "rotation" })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let drawn;
    await act(async () => {
      drawn = await result.current.handleDraw({
        prioritizeByServices: true,
        userStreamingServices: ["Netflix"],
      });
    });

    expect(mocks.rpcCalls).toContainEqual({
      name: "draw_bowl_movie_by_rotation",
      params: {
        p_bowl_id: "bowl-1",
        p_candidate_movie_ids: ["m1", "manual"],
        p_watched_timezone: "America/Chicago",
      },
    });
    expect(mocks.fetchStreamingProviders).toHaveBeenCalledTimes(1);
    expect(mocks.fetchStreamingProviders).not.toHaveBeenCalledWith(-42, { region: "US" });
    expect(drawn).toEqual(
      expect.objectContaining({ id: "manual", streamingProviders: [] })
    );
  });

  it("explains when the rotation database migration is missing", async () => {
    const movie = { id: "m1", tmdb_id: 101, title: "Movie A", added_by: "user-1" };
    mocks.remainingQueue.push([movie]);
    mocks.watchedQueue.push([]);
    mocks.rpcResponses.push({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.draw_bowl_movie_by_rotation",
      },
    });

    const { result } = renderHook(() =>
      useBowl("bowl-1", { drawMethod: "rotation" })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let drawn;
    await act(async () => {
      drawn = await result.current.handleDraw();
    });

    expect(drawn).toBeNull();
    expect(result.current.errorMessage).toMatch(/latest database migration/i);
  });

  it("enriches current and historical contributors without profile joins", async () => {
    mocks.profileDirectoryRows = [
      { user_id: "former-member", email: "former@example.com" },
    ];
    mocks.remainingQueue.push([
      {
        id: "m1",
        title: "Former Member Pick",
        added_by: "former-member",
      },
    ]);
    mocks.watchedQueue.push([
      {
        id: "event-1",
        source_bowl_movie_id: "m2",
        title: "Former Member Draw",
        added_by: "former-member",
      },
    ]);

    const { result } = renderHook(() => useBowl("bowl-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.bowl.remaining[0].profiles).toEqual({
      email: "former@example.com",
    });
    expect(result.current.bowl.watched[0].profiles).toEqual({
      email: "former@example.com",
    });
    expect(mocks.rpcCalls).toContainEqual({
      name: "get_bowl_profile_directory",
      params: { p_bowl_id: "bowl-1" },
    });
    expect(
      mocks.selectCalls
        .filter(({ table }) => table === "bowl_movies" || table === "bowl_draw_events")
        .map(({ columns }) => columns)
    ).not.toEqual(expect.arrayContaining([expect.stringContaining("profiles:profiles")]));
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
        note: "  Save this for Halloween.  ",
      });
    });

    expect(mocks.insertPayloads).toHaveLength(1);
    expect(mocks.insertPayloads[0][0]).toEqual(
      expect.objectContaining({
        bowl_id: "bowl-1",
        added_by: "user-1",
        tmdb_id: null,
        title: "Wildcard",
        note: "Save this for Halloween.",
      })
    );
  });

  it("updates an owned undrawn comment through the narrow RPC and patches state", async () => {
    const movie = {
      id: "m1",
      bowl_id: "bowl-1",
      added_by: "user-1",
      tmdb_id: 101,
      title: "Movie A",
      note: "Original",
    };
    mocks.remainingQueue.push([movie]);
    mocks.watchedQueue.push([]);
    mocks.rpcResponses.push({
      data: { ...movie, note: "Updated comment" },
      error: null,
    });

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let updateResult;
    await act(async () => {
      updateResult = await result.current.handleUpdateMovieNote(
        "m1",
        "  Updated comment  "
      );
    });

    expect(mocks.rpcCalls).toContainEqual({
      name: "update_own_bowl_movie_note",
      params: { p_bowl_movie_id: "m1", p_note: "Updated comment" },
    });
    expect(updateResult).toEqual(
      expect.objectContaining({ ok: true, movie: expect.objectContaining({ note: "Updated comment" }) })
    );
    expect(result.current.bowl.remaining[0].note).toBe("Updated comment");
  });

  it("returns an inline stale-edit error and reloads without changing the comment", async () => {
    const movie = {
      id: "m1",
      bowl_id: "bowl-1",
      added_by: "user-1",
      tmdb_id: 101,
      title: "Movie A",
      note: "Original",
    };
    mocks.remainingQueue.push([movie], [movie]);
    mocks.watchedQueue.push([], []);
    mocks.rpcResponses.push({
      data: null,
      error: { code: "P0001", message: "This movie comment is no longer available to edit." },
    });

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let updateResult;
    await act(async () => {
      updateResult = await result.current.handleUpdateMovieNote("m1", "Changed too late");
    });

    expect(updateResult).toEqual(
      expect.objectContaining({
        ok: false,
        message: expect.stringMatching(/may already have been drawn/i),
      })
    );
    expect(result.current.bowl.remaining[0].note).toBe("Original");
    expect(
      mocks.rpcCalls.filter(({ name }) => name === "get_bowl_profile_directory")
    ).toHaveLength(2);
  });

  it("moves the contributor pin through the narrow RPC and patches both owned rows", async () => {
    const movies = [
      {
        id: "m1",
        bowl_id: "bowl-1",
        added_by: "user-1",
        tmdb_id: 101,
        title: "New Pin",
        is_pinned: false,
      },
      {
        id: "m2",
        bowl_id: "bowl-1",
        added_by: "user-1",
        tmdb_id: 102,
        title: "Old Pin",
        is_pinned: true,
      },
    ];
    mocks.remainingQueue.push(movies);
    mocks.watchedQueue.push([]);
    mocks.rpcResponses.push({ data: { ...movies[0], is_pinned: true }, error: null });

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let pinResult;
    await act(async () => {
      pinResult = await result.current.handleSetMoviePin("m1", true);
    });

    expect(mocks.rpcCalls).toContainEqual({
      name: "set_own_bowl_movie_pin",
      params: { p_bowl_movie_id: "m1", p_pinned: true },
    });
    expect(pinResult).toEqual(
      expect.objectContaining({ ok: true, movie: expect.objectContaining({ is_pinned: true }) })
    );
    expect(result.current.bowl.remaining.map(({ id, is_pinned }) => ({ id, is_pinned }))).toEqual([
      { id: "m1", is_pinned: true },
      { id: "m2", is_pinned: false },
    ]);
  });

  it.each([
    [
      { code: "42501", message: "permission denied" },
      "You don't have permission to pin this movie.",
    ],
    [
      { code: "P0001", message: "This movie is no longer available to pin." },
      "This movie is no longer available to pin.",
    ],
  ])("returns a mapped pin failure without throwing", async (rpcError, expectedMessage) => {
    const movie = {
      id: "m1",
      bowl_id: "bowl-1",
      added_by: "user-1",
      tmdb_id: 101,
      title: "Movie A",
      is_pinned: false,
    };
    mocks.remainingQueue.push([movie], [movie]);
    mocks.watchedQueue.push([], []);
    mocks.rpcResponses.push({ data: null, error: rpcError });

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let pinResult;
    await act(async () => {
      pinResult = await result.current.handleSetMoviePin("m1", true);
    });

    expect(pinResult).toEqual({
      ok: false,
      code: "pin_update_failed",
      message: expectedMessage,
    });
    expect(result.current.bowl.remaining[0].is_pinned).toBe(false);
  });

  it("retries custom add with synthetic tmdb id when null tmdb_id is rejected", async () => {
    mocks.remainingQueue.push([], []);
    mocks.watchedQueue.push([], []);
    mocks.insertResponses.push(
      { data: null, error: { code: "23502", message: 'null value in column "tmdb_id"' } },
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

  it("optimistically adds a syncing row immediately and finalizes it after insert success", async () => {
    mocks.remainingQueue.push([], []);
    mocks.watchedQueue.push([], []);

    let resolveInsert;
    const insertPromise = new Promise((resolve) => {
      resolveInsert = resolve;
    });
    mocks.insertResponses.push(insertPromise);

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let addPromise;
    act(() => {
      addPromise = result.current.handleAddMovie({
        id: 101,
        title: "Movie A",
        genres: [{ name: "Action" }],
      });
    });

    await waitFor(() => expect(result.current.bowl.remaining).toHaveLength(1));
    expect(result.current.bowl.remaining[0]).toEqual(
      expect.objectContaining({
        title: "Movie A",
        local_status: "syncing",
        local_temp_id: expect.any(String),
      })
    );

    let added;
    expect(mocks.fetchProviderLinks).not.toHaveBeenCalled();
    await act(async () => {
      resolveInsert({
        data: {
          id: "db-1",
          bowl_id: "bowl-1",
          tmdb_id: 101,
          title: "Movie A",
          added_by: "user-1",
          added_at: "2026-03-06T12:00:00.000Z",
          snapshot_at: "2026-03-06T12:00:00.000Z",
          drawn_at: null,
          drawn_by: null,
        },
        error: null,
      });
      added = await addPromise;
    });

    expect(added).toEqual(expect.objectContaining({ ok: true }));
    expect(mocks.fetchProviderLinks).toHaveBeenCalledExactlyOnceWith(101, "bowl-1");
    await waitFor(() => {
      expect(result.current.bowl.remaining[0]).toEqual(
        expect.objectContaining({
          id: "db-1",
          local_status: null,
          local_temp_id: null,
        })
      );
    });
    expect(mocks.warmTmdbMovieFilterMetadata).toHaveBeenCalledWith(
      101,
      "bowl-1",
      "access-token"
    );
  });

  it("rolls back optimistic add and sets error message when insert fails", async () => {
    mocks.remainingQueue.push([], []);
    mocks.watchedQueue.push([], []);
    mocks.insertResponses.push({ data: null, error: { code: "P0001", message: "insert failed" } });

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleAddMovie({
        id: 101,
        title: "Movie A",
        genres: [],
      });
    });

    await waitFor(() => {
      expect(result.current.bowl.remaining).toHaveLength(0);
      expect(result.current.errorMessage).toMatch(/could not add this movie/i);
    });
    expect(mocks.fetchProviderLinks).not.toHaveBeenCalled();
  });

  it("does not fail an add when its provider lookup fails, and skips custom titles", async () => {
    mocks.fetchProviderLinks.mockRejectedValue(new Error("vendor down"));
    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      expect(await result.current.handleAddMovie({ id: 101, title: "Arrival" })).toMatchObject({ ok: true });
    });
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.bowl.remaining).toHaveLength(1);
    mocks.fetchProviderLinks.mockClear();
    await act(async () => {
      expect(await result.current.handleAddMovie({ title: "Home movie" })).toMatchObject({ ok: true });
    });
    expect(mocks.fetchProviderLinks).not.toHaveBeenCalled();
  });

  it("returns a duplicate result and rolls back when the database rejects a racing add", async () => {
    mocks.remainingQueue.push([]);
    mocks.watchedQueue.push([]);
    mocks.insertResponses.push({
      data: null,
      error: {
        code: "23505",
        message: "This movie is already in the bowl.",
        details: "bowl_active_tmdb_movies_pkey",
      },
    });

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let addMovieResult;
    await act(async () => {
      addMovieResult = await result.current.handleAddMovie({
        id: 101,
        title: "Movie A",
        genres: [],
      });
    });

    expect(addMovieResult).toEqual({
      ok: false,
      code: "duplicate_movie",
      message: "This movie is already in the bowl.",
    });
    expect(result.current.bowl.remaining).toHaveLength(0);
    expect(result.current.errorMessage).toBe("This movie is already in the bowl.");
  });

  it("prevents duplicate in-flight add for the same title but allows different titles", async () => {
    mocks.remainingQueue.push([], []);
    mocks.watchedQueue.push([], []);

    let resolveFirstInsert;
    const firstInsertPromise = new Promise((resolve) => {
      resolveFirstInsert = resolve;
    });
    mocks.insertResponses.push(
      firstInsertPromise,
      {
        data: {
          id: "db-2",
          bowl_id: "bowl-1",
          tmdb_id: 202,
          title: "Movie B",
          added_by: "user-1",
          added_at: "2026-03-06T12:00:01.000Z",
          snapshot_at: "2026-03-06T12:00:01.000Z",
          drawn_at: null,
          drawn_by: null,
        },
        error: null,
      }
    );

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let firstAddPromise;
    act(() => {
      firstAddPromise = result.current.handleAddMovie({
        id: 101,
        title: "Movie A",
        genres: [],
      });
    });
    await waitFor(() => expect(result.current.bowl.remaining).toHaveLength(1));

    let duplicateQueued;
    let secondTitleQueued;
    await act(async () => {
      duplicateQueued = await result.current.handleAddMovie({
        id: 101,
        title: "Movie A",
        genres: [],
      });
      secondTitleQueued = await result.current.handleAddMovie({
        id: 202,
        title: "Movie B",
        genres: [],
      });
    });

    expect(duplicateQueued).toEqual(
      expect.objectContaining({ ok: false, code: "duplicate_movie" })
    );
    expect(secondTitleQueued).toEqual(expect.objectContaining({ ok: true }));
    expect(mocks.insertPayloads).toHaveLength(2);
    expect(result.current.bowl.remaining).toHaveLength(2);
    expect(
      result.current.bowl.remaining.filter((movie) => movie.local_status === "syncing")
    ).toHaveLength(1);

    let firstQueued;
    await act(async () => {
      resolveFirstInsert({
        data: {
          id: "db-1",
          bowl_id: "bowl-1",
          tmdb_id: 101,
          title: "Movie A",
          added_by: "user-1",
          added_at: "2026-03-06T12:00:00.000Z",
          snapshot_at: "2026-03-06T12:00:00.000Z",
          drawn_at: null,
          drawn_by: null,
        },
        error: null,
      });
      firstQueued = await firstAddPromise;
    });

    expect(firstQueued).toEqual(expect.objectContaining({ ok: true }));
    await waitFor(() => {
      expect(
        result.current.bowl.remaining.map((movie) => movie.id)
      ).toEqual(expect.arrayContaining(["db-1", "db-2"]));
    });
  });

  it("draw updates only the selected duplicate TMDB row", async () => {
    const movie1 = { id: "m1", tmdb_id: 101, title: "Movie A", added_by: "user-1" };
    const movie2 = { id: "m2", tmdb_id: 101, title: "Movie A", added_by: "user-1" };

    mocks.remainingQueue.push([movie1, movie2], [movie2]);
    mocks.watchedQueue.push([], [
      { ...movie1, drawn_at: "2026-02-23T00:00:00.000Z", drawn_by: "user-1" },
    ]);
    mocks.fetchStreamingProviders.mockResolvedValue({
      providers: ["Netflix"],
      region: "US",
      fetchedAt: "2026-02-23T00:00:00.000Z",
    });

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleDraw({ randomFn: () => 0 });
    });

    expectDrawRpc("m1");
    expect(mocks.deleteCalled).toBe(false);
    expect(mocks.deleteInFilters).toEqual([]);

    await waitFor(() => {
      expect(result.current.bowl.remaining.map((movie) => movie.id)).toEqual(["m2"]);
      expect(result.current.bowl.watched).toHaveLength(1);
    });
  });

  it("draw updates only the selected duplicate custom-title row", async () => {
    const customA = { id: "c1", tmdb_id: -111, title: "Wildcard Night", added_by: "user-1" };
    const customB = { id: "c2", tmdb_id: -222, title: "Wildcard Night", added_by: "user-1" };

    mocks.remainingQueue.push([customA, customB], [customB]);
    mocks.watchedQueue.push([], [
      { ...customA, drawn_at: "2026-02-23T00:00:00.000Z", drawn_by: "user-1" },
    ]);
    mocks.fetchStreamingProviders.mockResolvedValue({
      providers: [],
      region: "US",
      fetchedAt: "2026-02-23T00:00:00.000Z",
    });

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleDraw({ randomFn: () => 0 });
    });

    expectDrawRpc("c1");
    expect(mocks.deleteCalled).toBe(false);
    expect(mocks.deleteInFilters).toEqual([]);

    await waitFor(() => {
      expect(result.current.bowl.remaining.map((movie) => movie.id)).toEqual(["c2"]);
      expect(result.current.bowl.watched).toHaveLength(1);
    });
  });

  it("does not delete another contributor's duplicate ticket during draw", async () => {
    const movie1 = { id: "m1", tmdb_id: 101, title: "Movie A", added_by: "user-1" };
    const movie2 = { id: "m2", tmdb_id: 101, title: "Movie A", added_by: "user-2" };

    mocks.remainingQueue.push([movie1, movie2], [movie2]);
    mocks.watchedQueue.push([], [
      { ...movie1, drawn_at: "2026-02-23T00:00:00.000Z", drawn_by: "user-1" },
    ]);
    mocks.fetchStreamingProviders.mockResolvedValue({
      providers: ["Netflix"],
      region: "US",
      fetchedAt: "2026-02-23T00:00:00.000Z",
    });

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleDraw({ randomFn: () => 0 });
    });

    expect(mocks.deleteCalled).toBe(false);
    expect(mocks.deleteInFilters).toEqual([]);

    await waitFor(() => {
      expect(result.current.bowl.remaining.map((movie) => movie.id)).toEqual(["m2"]);
      expect(result.current.bowl.watched).toHaveLength(1);
    });
  });

  it("re-adding a watched TMDB title moves it back to remaining", async () => {
    const watchedMovie = {
      id: "w1",
      tmdb_id: 101,
      title: "Movie A",
      drawn_at: "2026-02-23T00:00:00.000Z",
      drawn_by: "user-2",
    };
    const movedBackRow = {
      id: "w1",
      tmdb_id: 101,
      title: "Movie A",
      drawn_at: null,
      drawn_by: null,
    };

    mocks.remainingQueue.push([], [movedBackRow]);
    mocks.watchedQueue.push([watchedMovie], []);

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.bowl.watched).toHaveLength(1);

    await act(async () => {
      await result.current.handleReaddMovie("w1");
    });

    expect(mocks.insertPayloads).toHaveLength(0);
    expect(mocks.rpcCalls).toContainEqual({
      name: "return_bowl_draw_to_bowl",
      params: { p_draw_event_id: "w1" },
    });

    await waitFor(() => {
      expect(result.current.bowl.remaining).toHaveLength(1);
      expect(result.current.bowl.watched).toHaveLength(0);
    });
  });

  it("rejects re-adding a watched TMDB movie when an active copy exists", async () => {
    const activeMovie = {
      id: "r1",
      tmdb_id: 101,
      title: "Movie A",
      drawn_at: null,
    };
    const watchedMovie = {
      id: "w1",
      tmdb_id: 101,
      title: "Movie A",
      drawn_at: "2026-02-23T00:00:00.000Z",
    };

    mocks.remainingQueue.push([activeMovie]);
    mocks.watchedQueue.push([watchedMovie]);

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let readdResult;
    await act(async () => {
      readdResult = await result.current.handleReaddMovie("w1");
    });

    expect(readdResult).toEqual({
      ok: false,
      code: "duplicate_movie",
      message: "This movie is already in the bowl.",
    });
    expect(mocks.updatePayloads).toHaveLength(0);
  });

  it("does not re-add watched titles when undrawn movie limit is reached", async () => {
    const watchedCustom = {
      id: "c1",
      tmdb_id: -1234,
      title: "Wildcard",
      drawn_at: "2026-02-23T00:00:00.000Z",
      drawn_by: "user-2",
    };
    const maxedRemaining = Array.from({ length: MAX_UNDRAWN_MOVIES_PER_BOWL }, (_, index) => ({
      id: `m-${index + 1}`,
      tmdb_id: index + 1,
      title: `Movie ${index + 1}`,
    }));

    mocks.remainingQueue.push(maxedRemaining);
    mocks.watchedQueue.push([watchedCustom]);

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.bowl.remaining).toHaveLength(MAX_UNDRAWN_MOVIES_PER_BOWL);

    let readdResult;
    await act(async () => {
      readdResult = await result.current.handleReaddMovie("c1");
    });

    expect(readdResult).toEqual(expect.objectContaining({ ok: false, code: "limit_reached" }));
    expect(mocks.insertPayloads).toHaveLength(0);
    expect(mocks.updatePayloads).toHaveLength(0);
  });

  it("rejects an active TMDB duplicate without inserting another row", async () => {
    const existingRemaining = {
      id: "r1",
      tmdb_id: 101,
      title: "Movie A",
      drawn_at: null,
      drawn_by: null,
    };
    mocks.remainingQueue.push([existingRemaining]);
    mocks.watchedQueue.push([]);

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.bowl.remaining).toHaveLength(1);

    let addDuplicateResult;
    await act(async () => {
      addDuplicateResult = await result.current.handleAddMovie({
        id: 101,
        title: "Movie A",
        genres: [],
      });
    });

    expect(addDuplicateResult).toEqual({
      ok: false,
      code: "duplicate_movie",
      message: "This movie is already in the bowl.",
    });
    expect(mocks.insertPayloads).toHaveLength(0);
    expect(mocks.updatePayloads).toHaveLength(0);
    expect(result.current.bowl.remaining).toEqual([existingRemaining]);
  });

  it("names the existing contributor when rejecting an active TMDB duplicate", async () => {
    const existingRemaining = {
      id: "r1",
      tmdb_id: 101,
      title: "Movie A",
      added_by: "user-2",
      drawn_at: null,
    };
    mocks.remainingQueue.push([existingRemaining]);
    mocks.watchedQueue.push([]);
    mocks.profileDirectoryRows = [{ user_id: "user-2", email: "dan@example.com" }];

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let addDuplicateResult;
    await act(async () => {
      addDuplicateResult = await result.current.handleAddMovie({
        id: 101,
        title: "Movie A",
        genres: [],
      });
    });

    expect(addDuplicateResult).toEqual({
      ok: false,
      code: "duplicate_movie",
      message: '"Movie A" is already in the bowl — dan added it, so it can come up on their turn.',
    });
  });

  it("allows repeated custom titles", async () => {
    const existingCustom = {
      id: "c1",
      tmdb_id: -101,
      title: "Wildcard Night",
      drawn_at: null,
    };
    mocks.remainingQueue.push([existingCustom]);
    mocks.watchedQueue.push([]);

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let addCustomResult;
    await act(async () => {
      addCustomResult = await result.current.handleAddMovie({
        title: "Wildcard Night",
        genres: [],
      });
    });

    expect(addCustomResult).toEqual(expect.objectContaining({ ok: true }));
    expect(mocks.insertPayloads).toHaveLength(1);
    expect(mocks.insertPayloads[0][0].tmdb_id).toBeNull();
  });

  it("does not add when undrawn movie limit is reached", async () => {
    const maxedRemaining = Array.from({ length: MAX_UNDRAWN_MOVIES_PER_BOWL }, (_, index) => ({
      id: `m-${index + 1}`,
      tmdb_id: index + 1,
      title: `Movie ${index + 1}`,
    }));
    mocks.remainingQueue.push(maxedRemaining);
    mocks.watchedQueue.push([]);

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleAddMovie({
        id: 999,
        title: "Movie 999",
        genres: [],
      });
    });

    expect(mocks.insertPayloads).toHaveLength(0);
  });

  it("draw blocks with message when rating filters have no matches", async () => {
    const movie = { id: "m1", tmdb_id: 101, title: "Movie A" };
    mocks.remainingQueue.push([movie]);
    mocks.watchedQueue.push([]);
    mocks.getTmdbMovieDetails.mockResolvedValue({
      release_dates: {
        results: [
          {
            iso_3166_1: "US",
            release_dates: [{ certification: "PG-13" }],
          },
        ],
      },
    });

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let drawn;
    await act(async () => {
      drawn = await result.current.handleDraw({
        ratingFilter: {
          allowedRatings: ["R"],
          includeUnknown: false,
        },
      });
    });

    expect(drawn).toBeNull();
    expect(result.current.errorMessage).toMatch(/no titles match your selected ratings/i);
    expect(mocks.updatePayloads).toHaveLength(0);
  });

  it("draw filters candidates by allowed ratings", async () => {
    const pgMovie = { id: "m1", tmdb_id: 301, title: "Movie A" };
    const rMovie = { id: "m2", tmdb_id: 302, title: "Movie B" };
    mocks.remainingQueue.push([pgMovie, rMovie], [pgMovie]);
    mocks.watchedQueue.push([], [{ ...rMovie, drawn_at: "2026-02-23T00:00:00.000Z", drawn_by: "user-1" }]);

    mocks.getTmdbMovieDetails.mockImplementation(async (tmdbId) => {
      if (tmdbId === 301) {
        return {
          release_dates: { results: [{ iso_3166_1: "US", release_dates: [{ certification: "PG" }] }] },
        };
      }
      return {
        release_dates: { results: [{ iso_3166_1: "US", release_dates: [{ certification: "R" }] }] },
      };
    });
    mocks.fetchStreamingProviders.mockResolvedValue({ providers: [], region: "US", fetchedAt: null });

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleDraw({
        ratingFilter: {
          allowedRatings: ["R"],
          includeUnknown: false,
        },
      });
    });

    expectDrawRpc("m2");
    randomSpy.mockRestore();
  });

  it("shows a friendly message when draw is blocked by RLS", async () => {
    const movie = { id: "m1", tmdb_id: 101, title: "Movie A" };
    mocks.remainingQueue.push([movie]);
    mocks.watchedQueue.push([]);
    mocks.fetchStreamingProviders.mockResolvedValue({
      providers: [],
      region: "US",
      fetchedAt: null,
    });
    mocks.rpcResponses.push({
      data: null,
      error: { code: "42501", message: "permission denied for table bowl_movies" },
    });

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let drawn;
    await act(async () => {
      drawn = await result.current.handleDraw();
    });

    expect(drawn).toBeNull();
    expect(result.current.errorMessage).toMatch(/don't have permission to draw/i);
  });

  it("shows a retry message when drawing fails unexpectedly", async () => {
    const movie = { id: "m1", tmdb_id: 101, title: "Movie A" };
    mocks.remainingQueue.push([movie]);
    mocks.watchedQueue.push([]);
    mocks.fetchStreamingProviders.mockResolvedValue({
      providers: [],
      region: "US",
      fetchedAt: null,
    });
    mocks.rpcResponses.push({
      data: null,
      error: { code: "XX000", message: "database unavailable" },
    });

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let drawn;
    await act(async () => {
      drawn = await result.current.handleDraw();
    });

    expect(drawn).toBeNull();
    expect(result.current.errorMessage).toMatch(/could not draw a movie.*try again/i);
  });

  it("shows a retry message when the draw request throws", async () => {
    const movie = { id: "m1", tmdb_id: 101, title: "Movie A" };
    mocks.remainingQueue.push([movie]);
    mocks.watchedQueue.push([]);
    mocks.fetchStreamingProviders.mockResolvedValue({
      providers: [],
      region: "US",
      fetchedAt: null,
    });

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mocks.supabase.rpc.mockRejectedValueOnce(new Error("network unavailable"));

    let drawn;
    await act(async () => {
      drawn = await result.current.handleDraw();
    });

    expect(drawn).toBeNull();
    expect(result.current.errorMessage).toMatch(/could not draw a movie.*try again/i);
  });

  it("draw blocks with message when runtime filter has no matches", async () => {
    const movie = { id: "m1", tmdb_id: 401, title: "Long Movie", runtime: 150 };
    mocks.remainingQueue.push([movie]);
    mocks.watchedQueue.push([]);

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let drawn;
    await act(async () => {
      drawn = await result.current.handleDraw({
        runtimeFilter: {
          minMinutes: 60,
          maxMinutes: 90,
          includeUnknown: false,
        },
      });
    });

    expect(drawn).toBeNull();
    expect(result.current.errorMessage).toMatch(/no titles match your runtime filter/i);
    expect(mocks.updatePayloads).toHaveLength(0);
  });

  it("draw filters candidates by max runtime", async () => {
    const shortMovie = { id: "m1", tmdb_id: 501, title: "Short Movie", runtime: 95 };
    const longMovie = { id: "m2", tmdb_id: 502, title: "Long Movie", runtime: 180 };
    mocks.remainingQueue.push([shortMovie, longMovie], [longMovie]);
    mocks.watchedQueue.push([], [{ ...shortMovie, drawn_at: "2026-02-23T00:00:00.000Z", drawn_by: "user-1" }]);
    mocks.fetchStreamingProviders.mockResolvedValue({ providers: [], region: "US", fetchedAt: null });

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleDraw({
        runtimeFilter: {
          minMinutes: 0,
          maxMinutes: 100,
          includeUnknown: false,
        },
      });
    });

    expectDrawRpc("m1");
    randomSpy.mockRestore();
  });

  it("draw filters candidates by minimum runtime range", async () => {
    const shortMovie = { id: "m1", tmdb_id: 601, title: "Short Movie", runtime: 95 };
    const longMovie = { id: "m2", tmdb_id: 602, title: "Long Movie", runtime: 180 };
    mocks.remainingQueue.push([shortMovie, longMovie], [shortMovie]);
    mocks.watchedQueue.push([], [{ ...longMovie, drawn_at: "2026-02-23T00:00:00.000Z", drawn_by: "user-1" }]);
    mocks.fetchStreamingProviders.mockResolvedValue({ providers: [], region: "US", fetchedAt: null });

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleDraw({
        runtimeFilter: {
          minMinutes: 150,
          maxMinutes: 220,
          includeUnknown: false,
        },
      });
    });

    expectDrawRpc("m2");
    randomSpy.mockRestore();
  });

  it("draw blocks with message when genre filter has no matches", async () => {
    const movie = {
      id: "m1",
      tmdb_id: 701,
      title: "Action Movie",
      genres: ["Action"],
    };
    mocks.remainingQueue.push([movie]);
    mocks.watchedQueue.push([]);

    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let drawn;
    await act(async () => {
      drawn = await result.current.handleDraw({
        genreFilter: {
          allowedGenres: ["Comedy"],
          includeUnknown: false,
        },
      });
    });

    expect(drawn).toBeNull();
    expect(result.current.errorMessage).toMatch(/no titles match your genre filter/i);
    expect(mocks.updatePayloads).toHaveLength(0);
  });

  it("draw filters candidates by selected genres", async () => {
    const actionMovie = { id: "m1", tmdb_id: 801, title: "Action Movie", genres: ["Action"] };
    const comedyMovie = { id: "m2", tmdb_id: 802, title: "Comedy Movie", genres: ["Comedy"] };
    mocks.remainingQueue.push([actionMovie, comedyMovie], [actionMovie]);
    mocks.watchedQueue.push([], [{ ...comedyMovie, drawn_at: "2026-02-23T00:00:00.000Z", drawn_by: "user-1" }]);
    mocks.fetchStreamingProviders.mockResolvedValue({ providers: [], region: "US", fetchedAt: null });

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const { result } = renderHook(() => useBowl("bowl-1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleDraw({
        genreFilter: {
          allowedGenres: ["Comedy"],
          includeUnknown: false,
        },
      });
    });

    expectDrawRpc("m2");
    randomSpy.mockRestore();
  });
});
