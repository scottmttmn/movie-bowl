import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTmdbMovieFilterMetadata: vi.fn(),
  primeStreamingProvidersCache: vi.fn(),
}));

vi.mock("../tmdbApi", () => ({
  getTmdbMovieFilterMetadata: mocks.getTmdbMovieFilterMetadata,
}));

vi.mock("../streamingProviders", () => ({
  primeStreamingProvidersCache: mocks.primeStreamingProvidersCache,
}));

import {
  clearMovieFilterMetadataCache,
  fetchMovieFilterMetadata,
} from "../movieFilterMetadata";

describe("movieFilterMetadata", () => {
  beforeEach(() => {
    clearMovieFilterMetadataCache();
    mocks.getTmdbMovieFilterMetadata.mockReset();
    mocks.primeStreamingProvidersCache.mockReset();
  });

  it("returns a no-lookup fallback for custom ids", async () => {
    await expect(fetchMovieFilterMetadata(-1)).resolves.toEqual({
      details: {},
      providers: [],
      region: "US",
      fetchedAt: null,
    });
    expect(mocks.getTmdbMovieFilterMetadata).not.toHaveBeenCalled();
  });

  it("deduplicates, caches, and primes combined provider metadata", async () => {
    let resolveRequest;
    mocks.getTmdbMovieFilterMetadata.mockImplementation(
      () => new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    const first = fetchMovieFilterMetadata(77);
    const second = fetchMovieFilterMetadata(77);
    expect(mocks.getTmdbMovieFilterMetadata).toHaveBeenCalledTimes(1);

    resolveRequest({
      details: { id: 77 },
      providers: ["Netflix"],
      region: "US",
      fetchedAt: "2026-08-27T00:00:00.000Z",
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    const warmResult = await fetchMovieFilterMetadata(77);
    expect(secondResult).toEqual(firstResult);
    expect(warmResult).toEqual(firstResult);
    expect(mocks.getTmdbMovieFilterMetadata).toHaveBeenCalledTimes(1);
    expect(mocks.primeStreamingProvidersCache).toHaveBeenCalledWith(77, firstResult);
  });
});
