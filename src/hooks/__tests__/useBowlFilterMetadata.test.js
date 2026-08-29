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
    expect(result.current.hasCompleteMetadataSnapshot).toBe(true);
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
    expect(result.current.hasCompleteMetadataSnapshot).toBe(false);
    await act(async () => {
      await expect(result.current.fetchMovieDetails(10)).resolves.toEqual({ id: 10 });
      await expect(result.current.fetchProviders(10)).resolves.toMatchObject({ providers: ["Tubi"] });
    });

    expect(fetchMovieDetailsFallback).toHaveBeenCalledTimes(1);
    expect(fetchProvidersFallback).toHaveBeenCalledTimes(1);
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
  });
});
