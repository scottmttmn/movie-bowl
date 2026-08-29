import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useDrawPoolCount, {
  AUTO_LOOKUP_TITLE_LIMIT,
  DRAW_POOL_STATUS,
} from "../useDrawPoolCount";
import { clearDrawSelectionCache } from "../../utils/drawSelection";
import { MPAA_RATING_OPTIONS } from "../../utils/movieRatings";

function movie(id, overrides = {}) {
  return {
    id,
    tmdb_id: Number(id.replace(/\D/g, "")) || 1,
    title: `Movie ${id}`,
    added_by: "user-1",
    genres: ["Action"],
    runtime: 100,
    ...overrides,
  };
}

const ALL_RATINGS = { allowedRatings: MPAA_RATING_OPTIONS, includeUnknown: true };
const ALL_GENRES = { allowedGenres: ["Action", "Comedy"], includeUnknown: true };
const ALL_RUNTIMES = { minMinutes: 0, maxMinutes: 400, includeUnknown: true };

describe("useDrawPoolCount", () => {
  beforeEach(() => {
    clearDrawSelectionCache();
  });

  // Unmount between cases so an in-flight count is cancelled by the hook's own
  // run token instead of resolving into a torn-down environment.
  afterEach(() => {
    cleanup();
  });

  it("reports unfiltered when the filters remove nothing", async () => {
    const fetchMovieDetails = vi.fn();
    const { result } = renderHook(() =>
      useDrawPoolCount([movie("m1"), movie("m2")], {
        ratingFilter: ALL_RATINGS,
        genreFilter: ALL_GENRES,
        runtimeFilter: ALL_RUNTIMES,
      }, { fetchMovieDetails })
    );

    await waitFor(() => expect(result.current.status).toBe(DRAW_POOL_STATUS.unfiltered));
    expect(result.current.eligibleMovieIds).toEqual(["m1", "m2"]);
    expect(fetchMovieDetails).not.toHaveBeenCalled();
  });

  // An exhaustive rating filter is the default state of the draw filters, so
  // the common case must not cost a TMDB lookup per title.
  it("does not look up ratings when the rating filter allows everything", async () => {
    const fetchMovieDetails = vi.fn();
    const { result } = renderHook(() =>
      useDrawPoolCount([movie("m1"), movie("m2", { genres: ["Comedy"] })], {
        ratingFilter: ALL_RATINGS,
        genreFilter: { allowedGenres: ["Action"], includeUnknown: false },
        runtimeFilter: ALL_RUNTIMES,
      }, { fetchMovieDetails })
    );

    await waitFor(() => expect(result.current.status).toBe(DRAW_POOL_STATUS.ready));
    expect(result.current.poolCount).toBe(1);
    expect(result.current.totalCount).toBe(2);
    expect(result.current.eligibleMovieIds).toEqual(["m1"]);
    expect(fetchMovieDetails).not.toHaveBeenCalled();
  });

  it("excludes rows that are still syncing from both counts", async () => {
    const fetchMovieDetails = vi.fn();
    const { result } = renderHook(() =>
      useDrawPoolCount(
        [movie("m1"), movie("m2", { genres: ["Comedy"] }), movie("m3", { local_status: "syncing" })],
        {
          ratingFilter: ALL_RATINGS,
          genreFilter: { allowedGenres: ["Action"], includeUnknown: false },
          runtimeFilter: ALL_RUNTIMES,
        },
        { fetchMovieDetails }
      )
    );

    await waitFor(() => expect(result.current.status).toBe(DRAW_POOL_STATUS.ready));
    expect(result.current.totalCount).toBe(2);
    expect(result.current.poolCount).toBe(1);
  });

  it("reports which contributors the filtered pool cannot reach", async () => {
    const fetchMovieDetails = vi.fn();
    const movies = [
      movie("m1", { added_by: "user-1", profiles: { email: "alex@example.com" } }),
      movie("m2", { added_by: "user-2", profiles: { email: "sam@example.com" }, genres: ["Comedy"] }),
    ];

    const { result } = renderHook(() =>
      useDrawPoolCount(movies, {
        ratingFilter: ALL_RATINGS,
        genreFilter: { allowedGenres: ["Action"], includeUnknown: false },
        runtimeFilter: ALL_RUNTIMES,
      }, { fetchMovieDetails })
    );

    await waitFor(() => expect(result.current.status).toBe(DRAW_POOL_STATUS.ready));
    expect(result.current.contributorReach).toEqual({
      totalCount: 2,
      reachedCount: 1,
      excludedNames: ["sam"],
    });
  });

  it("waits for a tap above the default 100-title lookup limit", async () => {
    const fetchMovieDetails = vi.fn(async () => ({
      release_dates: { results: [{ iso_3166_1: "US", release_dates: [{ certification: "R" }] }] },
    }));
    const movies = Array.from(
      { length: AUTO_LOOKUP_TITLE_LIMIT + 1 },
      (unused, index) => movie(`m${index + 1}`)
    );

    const { result } = renderHook(() =>
      useDrawPoolCount(movies, {
        ratingFilter: { allowedRatings: ["R"], includeUnknown: false },
        genreFilter: ALL_GENRES,
        runtimeFilter: ALL_RUNTIMES,
      }, { fetchMovieDetails })
    );

    await waitFor(() => expect(result.current.status).toBe(DRAW_POOL_STATUS.manual));
    expect(result.current.eligibleMovieIds).toBeNull();
    expect(fetchMovieDetails).not.toHaveBeenCalled();

    act(() => {
      result.current.runLookups();
    });

    await waitFor(() => expect(result.current.status).not.toBe(DRAW_POOL_STATUS.manual));
    expect(fetchMovieDetails).toHaveBeenCalled();
  });

  it("counts a large bowl automatically when every lookup is in the persistent snapshot", async () => {
    const fetchMovieDetails = vi.fn(async () => ({
      release_dates: {
        results: [{ iso_3166_1: "US", release_dates: [{ certification: "R" }] }],
      },
    }));
    const movies = Array.from(
      { length: AUTO_LOOKUP_TITLE_LIMIT + 1 },
      (unused, index) => movie(`cached-${index + 1}`)
    );

    const { result } = renderHook(() => useDrawPoolCount(movies, {
      ratingFilter: { allowedRatings: ["R"], includeUnknown: false },
      genreFilter: ALL_GENRES,
      runtimeFilter: ALL_RUNTIMES,
    }, {
      fetchMovieDetails,
      hasCompleteMetadataSnapshot: true,
    }));

    await waitFor(() => expect(result.current.status).toBe(DRAW_POOL_STATUS.unfiltered));
    expect(fetchMovieDetails).toHaveBeenCalledTimes(AUTO_LOOKUP_TITLE_LIMIT + 1);
  });

  it("counts automatically when the bowl is small enough to look up", async () => {
    const fetchMovieDetails = vi.fn(async (tmdbId) => ({
      release_dates: {
        results: [
          {
            iso_3166_1: "US",
            release_dates: [{ certification: tmdbId === 1 ? "G" : "R" }],
          },
        ],
      },
    }));

    const { result } = renderHook(() =>
      useDrawPoolCount([movie("m1"), movie("m2")], {
        ratingFilter: { allowedRatings: ["G"], includeUnknown: false },
        genreFilter: ALL_GENRES,
        runtimeFilter: ALL_RUNTIMES,
      }, { fetchMovieDetails, autoLookupLimit: 10 })
    );

    await waitFor(() => expect(result.current.status).toBe(DRAW_POOL_STATUS.ready));
    expect(result.current.poolCount).toBe(1);
  });

  it("reports an empty pool as ready rather than hiding it", async () => {
    const fetchMovieDetails = vi.fn();
    const { result } = renderHook(() =>
      useDrawPoolCount([movie("m1")], {
        ratingFilter: ALL_RATINGS,
        genreFilter: { allowedGenres: ["Comedy"], includeUnknown: false },
        runtimeFilter: ALL_RUNTIMES,
      }, { fetchMovieDetails })
    );

    await waitFor(() => expect(result.current.status).toBe(DRAW_POOL_STATUS.ready));
    expect(result.current.poolCount).toBe(0);
    expect(result.current.contributorReach.reachedCount).toBe(0);
  });

  it("ranks streaming services only after the ordinary filters have run", async () => {
    const fetchMovieDetails = vi.fn();
    const fetchProviders = vi.fn(async (tmdbId) => ({
      providers: tmdbId === 1 ? ["Netflix"] : ["Max"],
      region: "US",
      fetchedAt: null,
    }));
    const movies = [
      movie("m1", { genres: ["Comedy"] }),
      movie("m2", { genres: ["Action"] }),
    ];

    const { result } = renderHook(() =>
      useDrawPoolCount(
        movies,
        {
          prioritizeByServices: true,
          prioritizeByServiceRank: true,
          userStreamingServices: ["Netflix", "Max"],
          ratingFilter: ALL_RATINGS,
          genreFilter: { allowedGenres: ["Action"], includeUnknown: false },
          runtimeFilter: ALL_RUNTIMES,
        },
        { fetchMovieDetails, fetchProviders }
      )
    );

    await waitFor(() => expect(result.current.status).toBe(DRAW_POOL_STATUS.ready));
    expect(result.current.poolCount).toBe(1);
    expect(result.current.streamingMatch).toEqual({
      matchCount: 1,
      topService: "Max",
      topServiceCount: 1,
    });
    expect(fetchProviders).toHaveBeenCalledTimes(1);
    expect(fetchProviders).toHaveBeenCalledWith(2);
  });

  it("uses combined metadata for the whole-bowl count when both lookups are needed", async () => {
    const fetchFilterMetadata = vi.fn(async (tmdbId) => ({
      details: {
        release_dates: {
          results: [{ iso_3166_1: "US", release_dates: [{ certification: "R" }] }],
        },
      },
      providers: tmdbId === 1 ? ["Netflix"] : ["Max"],
      region: "US",
      fetchedAt: null,
    }));
    const fetchMovieDetails = vi.fn();
    const fetchProviders = vi.fn();

    const { result } = renderHook(() =>
      useDrawPoolCount(
        [movie("m1"), movie("m2")],
        {
          prioritizeByServices: true,
          prioritizeByServiceRank: true,
          userStreamingServices: ["Netflix", "Max"],
          ratingFilter: { allowedRatings: ["R"], includeUnknown: false },
          genreFilter: ALL_GENRES,
          runtimeFilter: ALL_RUNTIMES,
        },
        { fetchMovieDetails, fetchProviders, fetchFilterMetadata }
      )
    );

    await waitFor(() => expect(result.current.status).toBe(DRAW_POOL_STATUS.ready));
    expect(result.current.poolCount).toBe(1);
    expect(fetchFilterMetadata).toHaveBeenCalledTimes(2);
    expect(fetchMovieDetails).not.toHaveBeenCalled();
    expect(fetchProviders).not.toHaveBeenCalled();
  });

  it("excludes a manual title and its contributor when another title matches priority", async () => {
    const fetchMovieDetails = vi.fn();
    const fetchProviders = vi.fn(async () => ({
      providers: ["Netflix"],
      region: "US",
      fetchedAt: null,
    }));
    const movies = [
      movie("m1", { added_by: "user-1", profiles: { email: "alex@example.com" } }),
      movie("manual", {
        tmdb_id: -42,
        added_by: "user-2",
        profiles: { email: "sam@example.com" },
      }),
    ];

    const { result } = renderHook(() =>
      useDrawPoolCount(
        movies,
        {
          prioritizeByServices: true,
          prioritizeByServiceRank: true,
          userStreamingServices: ["Netflix"],
          ratingFilter: ALL_RATINGS,
          genreFilter: ALL_GENRES,
          runtimeFilter: ALL_RUNTIMES,
        },
        { fetchMovieDetails, fetchProviders }
      )
    );

    await waitFor(() => expect(result.current.status).toBe(DRAW_POOL_STATUS.ready));
    expect(result.current.poolCount).toBe(1);
    expect(result.current.contributorReach).toEqual({
      totalCount: 2,
      reachedCount: 1,
      excludedNames: ["sam"],
    });
    expect(fetchProviders).toHaveBeenCalledTimes(1);
    expect(fetchProviders).not.toHaveBeenCalledWith(-42);
  });

  it("keeps manual titles in the fallback pool when no service matches", async () => {
    const fetchMovieDetails = vi.fn();
    const fetchProviders = vi.fn(async () => ({
      providers: ["Paramount+"],
      region: "US",
      fetchedAt: null,
    }));
    const movies = [movie("m1"), movie("manual", { tmdb_id: -42 })];

    const { result } = renderHook(() =>
      useDrawPoolCount(
        movies,
        {
          prioritizeByServices: true,
          prioritizeByServiceRank: true,
          userStreamingServices: ["Netflix"],
          ratingFilter: ALL_RATINGS,
          genreFilter: ALL_GENRES,
          runtimeFilter: ALL_RUNTIMES,
        },
        { fetchMovieDetails, fetchProviders }
      )
    );

    await waitFor(() => expect(result.current.status).toBe(DRAW_POOL_STATUS.unfiltered));
    expect(result.current.poolCount).toBe(2);
    expect(result.current.streamingMatch.matchCount).toBe(0);
    expect(fetchProviders).toHaveBeenCalledTimes(1);
  });
});
