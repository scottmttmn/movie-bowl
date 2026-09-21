import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDrawSelectionCache } from "../../utils/drawSelection";
import useMyMovieEligibility, {
  MY_MOVIE_ELIGIBILITY_STATUS,
} from "../useMyMovieEligibility";

function movie(id, overrides = {}) {
  return {
    id,
    tmdb_id: Number(String(id).replace(/\D/g, "")) || 1,
    genres: ["Action"],
    runtime: 100,
    ...overrides,
  };
}

const filters = {
  ratingFilter: { allowedRatings: ["PG"], includeUnknown: false },
  genreFilter: { allowedGenres: ["Action"], includeUnknown: true },
  runtimeFilter: { minMinutes: 0, maxMinutes: 500, includeUnknown: true },
  prioritizeByServices: false,
  prioritizeByServiceRank: true,
  userStreamingServices: [],
};

function pgDetails() {
  return {
    release_dates: {
      results: [{ iso_3166_1: "US", release_dates: [{ certification: "PG" }] }],
    },
  };
}

describe("useMyMovieEligibility", () => {
  beforeEach(() => {
    clearDrawSelectionCache();
  });

  afterEach(() => {
    cleanup();
  });

  it("does not perform lookups while the strip is collapsed", () => {
    const fetchMovieDetails = vi.fn(async () => pgDetails());
    const movies = [movie("m1")];
    const { result } = renderHook(() => useMyMovieEligibility(
      movies,
      movies,
      filters,
      { enabled: false, fetchMovieDetails }
    ));

    expect(result.current.status).toBe(MY_MOVIE_ELIGIBILITY_STATUS.idle);
    expect(fetchMovieDetails).not.toHaveBeenCalled();
  });

  it("waits for and reuses the shared whole-bowl eligibility result", async () => {
    const fetchMovieDetails = vi.fn(async () => pgDetails());
    const movies = [movie("m1"), movie("m2")];
    const { result, rerender } = renderHook(
      ({ sharedEligibleMovieIds, isSharedEligibilityPending }) =>
        useMyMovieEligibility(movies, movies, filters, {
          enabled: true,
          fetchMovieDetails,
          sharedEligibleMovieIds,
          isSharedEligibilityPending,
        }),
      {
        initialProps: {
          sharedEligibleMovieIds: null,
          isSharedEligibilityPending: true,
        },
      }
    );

    expect(result.current.status).toBe(MY_MOVIE_ELIGIBILITY_STATUS.checking);
    expect(fetchMovieDetails).not.toHaveBeenCalled();

    rerender({
      sharedEligibleMovieIds: ["m2"],
      isSharedEligibilityPending: false,
    });

    await waitFor(() => expect(result.current.status).toBe(MY_MOVIE_ELIGIBILITY_STATUS.ready));
    expect(result.current.eligibleMovieIds).toEqual(["m2"]);
    expect(fetchMovieDetails).not.toHaveBeenCalled();
  });

  it("requires authorization above the owned-title lookup threshold", async () => {
    const movies = [movie("m1"), movie("m2"), movie("m3")];
    const fetchMovieDetails = vi.fn(async () => pgDetails());
    const { result } = renderHook(() => useMyMovieEligibility(
      movies,
      movies,
      filters,
      { enabled: true, fetchMovieDetails, autoLookupLimit: 2 }
    ));

    expect(result.current.status).toBe(MY_MOVIE_ELIGIBILITY_STATUS.manual);
    expect(fetchMovieDetails).not.toHaveBeenCalled();

    act(() => result.current.runLookups());

    await waitFor(() => expect(result.current.status).toBe(MY_MOVIE_ELIGIBILITY_STATUS.ready));
    expect(result.current.eligibleMovieIds).toEqual(["m1", "m2", "m3"]);
    expect(fetchMovieDetails).toHaveBeenCalledTimes(3);
  });

  it("does not require authorization when the persistent snapshot covers the list", async () => {
    const movies = [movie("cached-1"), movie("cached-2"), movie("cached-3")];
    const fetchMovieDetails = vi.fn(async () => pgDetails());
    const { result } = renderHook(() => useMyMovieEligibility(
      movies,
      movies,
      filters,
      {
        enabled: true,
        fetchMovieDetails,
        autoLookupLimit: 2,
        isMetadataCached: () => true,
      }
    ));

    await waitFor(() => expect(result.current.status).toBe(MY_MOVIE_ELIGIBILITY_STATUS.ready));
    expect(result.current.eligibleMovieIds).toHaveLength(3);
  });

  // One title the daily cache has never seen is one lookup, not a fresh bill
  // for the whole list, so adding a movie must not put the opt-in back.
  it("keeps resolving when one added title is outside the snapshot", async () => {
    const cached = [movie("cached-11"), movie("cached-12"), movie("cached-13")];
    const added = movie("added-14");
    const fetchMovieDetails = vi.fn(async () => pgDetails());
    const isMetadataCached = (tmdbId) => tmdbId !== Number(added.tmdb_id);
    const { result, rerender } = renderHook(
      ({ list }) => useMyMovieEligibility(list, list, filters, {
        enabled: true,
        fetchMovieDetails,
        autoLookupLimit: 2,
        isMetadataCached,
      }),
      { initialProps: { list: cached } }
    );

    await waitFor(() => expect(result.current.status).toBe(MY_MOVIE_ELIGIBILITY_STATUS.ready));

    rerender({ list: [...cached, added] });

    await waitFor(() => expect(result.current.eligibleMovieIds).toHaveLength(4));
    expect(result.current.status).toBe(MY_MOVIE_ELIGIBILITY_STATUS.ready);
  });

  it("resets explicit lookup authorization when filters change", async () => {
    const movies = [movie("m11"), movie("m12"), movie("m13")];
    const fetchMovieDetails = vi.fn(async () => pgDetails());
    const { result, rerender } = renderHook(
      ({ activeFilters }) => useMyMovieEligibility(
        movies,
        movies,
        activeFilters,
        { enabled: true, fetchMovieDetails, autoLookupLimit: 2 }
      ),
      { initialProps: { activeFilters: filters } }
    );

    act(() => result.current.runLookups());
    await waitFor(() => expect(result.current.status).toBe(MY_MOVIE_ELIGIBILITY_STATUS.ready));

    rerender({
      activeFilters: {
        ...filters,
        ratingFilter: { allowedRatings: ["R"], includeUnknown: false },
      },
    });

    expect(result.current.status).toBe(MY_MOVIE_ELIGIBILITY_STATUS.manual);
  });

  it("uses combined metadata and ignores a stale result after filters change", async () => {
    let resolveFirst;
    const fetchFilterMetadata = vi.fn((tmdbId) => {
      if (tmdbId === 21) {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve({ details: pgDetails(), providers: ["Netflix"] });
    });
    const movies = [movie("m21", { tmdb_id: 21 })];
    const initialFilters = {
      ...filters,
      prioritizeByServices: true,
      userStreamingServices: ["Netflix"],
    };
    const { result, rerender } = renderHook(
      ({ activeFilters }) => useMyMovieEligibility(
        movies,
        movies,
        activeFilters,
        {
          enabled: true,
          fetchMovieDetails: vi.fn(async () => pgDetails()),
          fetchProviders: vi.fn(async () => ({ providers: ["Netflix"] })),
          fetchFilterMetadata,
        }
      ),
      { initialProps: { activeFilters: initialFilters } }
    );

    await waitFor(() => expect(fetchFilterMetadata).toHaveBeenCalledTimes(1));
    rerender({
      activeFilters: {
        ...initialFilters,
        genreFilter: { allowedGenres: ["Comedy"], includeUnknown: false },
      },
    });
    await waitFor(() => expect(result.current.status).toBe(MY_MOVIE_ELIGIBILITY_STATUS.ready));
    expect(result.current.eligibleMovieIds).toEqual([]);

    resolveFirst({ details: pgDetails(), providers: ["Netflix"] });
    await act(async () => Promise.resolve());

    expect(result.current.eligibleMovieIds).toEqual([]);
  });
});
