import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({
  supabase: { rpc: mocks.rpc },
}));

import useBowlFilterMetadata, {
  BOWL_FILTER_METADATA_STATUS,
} from "../useBowlFilterMetadata";

const MOVIES = [{ id: "movie-1", tmdb_id: 10 }, { id: "movie-2", tmdb_id: 20 }];

describe("useBowlFilterMetadata", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  it("serves rating and provider lookups from one bowl-scoped cache read", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          tmdb_id: 10,
          region: "US",
          certification: "PG-13",
          providers: ["netflix", "HBO Max"],
          fetched_at: "2026-08-28T08:00:00.000Z",
        },
        {
          tmdb_id: 20,
          region: "US",
          certification: null,
          providers: [],
          fetched_at: "2026-08-28T08:00:00.000Z",
        },
      ],
      error: null,
    });
    const fetchMovieDetailsFallback = vi.fn();
    const fetchProvidersFallback = vi.fn();
    const fetchFilterMetadataFallback = vi.fn();
    const { result } = renderHook(() => useBowlFilterMetadata("bowl-1", MOVIES, {
      fetchMovieDetailsFallback,
      fetchProvidersFallback,
      fetchFilterMetadataFallback,
    }));

    await waitFor(() => expect(result.current.status).toBe(BOWL_FILTER_METADATA_STATUS.ready));
    expect(result.current.isMetadataCached(10)).toBe(true);
    expect(result.current.isMetadataCached(20)).toBe(true);
    let details;
    let providers;
    let combined;
    await act(async () => {
      [details, providers, combined] = await Promise.all([
        result.current.fetchMovieDetails(10),
        result.current.fetchProviders(10),
        result.current.fetchFilterMetadata(20),
      ]);
    });

    expect(details.release_dates.results[0].release_dates[0].certification).toBe("PG-13");
    expect(providers.providers).toEqual(["Netflix", "Max"]);
    expect(combined).toMatchObject({ certification: null, providers: [], region: "US" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(fetchMovieDetailsFallback).not.toHaveBeenCalled();
    expect(fetchProvidersFallback).not.toHaveBeenCalled();
    expect(fetchFilterMetadataFallback).not.toHaveBeenCalled();
  });

  it("uses live lookup only for metadata that has never completed", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        tmdb_id: 10,
        region: "US",
        certification: null,
        providers: [],
        fetched_at: null,
      }],
      error: null,
    });
    const fetchMovieDetailsFallback = vi.fn(async () => ({ id: 10 }));
    const fetchProvidersFallback = vi.fn(async () => ({ providers: ["Tubi"], region: "US" }));
    const fetchFilterMetadataFallback = vi.fn();
    const { result } = renderHook(() => useBowlFilterMetadata("bowl-1", [MOVIES[0]], {
      fetchMovieDetailsFallback,
      fetchProvidersFallback,
      fetchFilterMetadataFallback,
    }));

    await waitFor(() => expect(result.current.status).toBe(BOWL_FILTER_METADATA_STATUS.ready));
    expect(result.current.isMetadataCached(10)).toBe(false);
    await act(async () => {
      await expect(result.current.fetchMovieDetails(10)).resolves.toEqual({ id: 10 });
      await expect(result.current.fetchProviders(10)).resolves.toMatchObject({ providers: ["Tubi"] });
    });

    expect(fetchMovieDetailsFallback).toHaveBeenCalledTimes(1);
    expect(fetchProvidersFallback).toHaveBeenCalledTimes(1);
  });

  // Adding a movie re-reads the cache for a pool that now has one more title.
  // What the cache already holds for the other titles has not changed, and the
  // readouts that price themselves on it must not see them go dark meanwhile.
  it("keeps answering for the titles it already cached while a reload is in flight", async () => {
    let resolveSecondRead;
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{
          tmdb_id: 10,
          region: "US",
          certification: "PG-13",
          providers: [],
          fetched_at: "2026-08-28T08:00:00.000Z",
        }],
        error: null,
      })
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveSecondRead = resolve;
      }));

    const { result, rerender } = renderHook(
      ({ movies }) => useBowlFilterMetadata("bowl-1", movies),
      { initialProps: { movies: [MOVIES[0]] } }
    );

    await waitFor(() => expect(result.current.isMetadataCached(10)).toBe(true));

    rerender({ movies: MOVIES });

    expect(result.current.status).toBe(BOWL_FILTER_METADATA_STATUS.loading);
    expect(result.current.isMetadataCached(10)).toBe(true);
    expect(result.current.isMetadataCached(20)).toBe(false);

    await act(async () => {
      resolveSecondRead({
        data: [{
          tmdb_id: 10,
          region: "US",
          certification: "PG-13",
          providers: [],
          fetched_at: "2026-08-28T08:00:00.000Z",
        }],
        error: null,
      });
    });

    await waitFor(() => expect(result.current.status).toBe(BOWL_FILTER_METADATA_STATUS.ready));
    expect(result.current.isMetadataCached(10)).toBe(true);
    expect(result.current.isMetadataCached(20)).toBe(false);
  });

  // Opening a bowl sends the cache read beside the movie list instead of after
  // it, so the pool readouts are not held back a round trip.
  it("sends the cache read before the movie list arrives and serves that list from it", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        tmdb_id: 10,
        region: "US",
        certification: "PG-13",
        providers: [],
        fetched_at: "2026-08-28T08:00:00.000Z",
      }],
      error: null,
    });

    const { result, rerender } = renderHook(
      ({ movies }) => useBowlFilterMetadata("bowl-1", movies),
      { initialProps: { movies: [] } }
    );

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("get_bowl_filter_metadata", {
      p_bowl_id: "bowl-1",
      p_region: "US",
    });

    rerender({ movies: [MOVIES[0]] });

    await waitFor(() => expect(result.current.status).toBe(BOWL_FILTER_METADATA_STATUS.ready));
    expect(result.current.isMetadataCached(10)).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    // A later list is a changed bowl, which the opening read cannot speak for.
    rerender({ movies: MOVIES });
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
  });

  it("falls back safely when the cache migration is unavailable", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc.mockRejectedValue(new TypeError("Failed to fetch"));
    const fetchMovieDetailsFallback = vi.fn(async () => ({ id: 10 }));
    const { result } = renderHook(() => useBowlFilterMetadata("bowl-1", [MOVIES[0]], {
      fetchMovieDetailsFallback,
    }));

    await waitFor(() => expect(result.current.status).toBe(BOWL_FILTER_METADATA_STATUS.fallback));
    await act(async () => {
      await expect(result.current.fetchMovieDetails(10)).resolves.toEqual({ id: 10 });
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  // Holding the last good ids through a reload must not outlive a reload that
  // failed: those fetchers serve nothing, so every title goes to the network
  // and none of them may be priced as free.
  it("stops calling titles cached once a reload of them fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{
          tmdb_id: 10,
          region: "US",
          certification: "PG-13",
          providers: [],
          fetched_at: "2026-08-28T08:00:00.000Z",
        }],
        error: null,
      })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const { result, rerender } = renderHook(
      ({ movies }) => useBowlFilterMetadata("bowl-1", movies),
      { initialProps: { movies: [MOVIES[0]] } }
    );

    await waitFor(() => expect(result.current.isMetadataCached(10)).toBe(true));

    rerender({ movies: MOVIES });

    await waitFor(() => expect(result.current.status).toBe(BOWL_FILTER_METADATA_STATUS.fallback));
    expect(result.current.isMetadataCached(10)).toBe(false);
    errorSpy.mockRestore();
  });
});
