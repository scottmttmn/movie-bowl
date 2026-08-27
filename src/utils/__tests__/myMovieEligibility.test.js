import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearDrawSelectionCache } from "../drawSelection";
import { resolveMyMovieEligibility } from "../myMovieEligibility";

function movie(id, overrides = {}) {
  return {
    id,
    tmdb_id: Number(String(id).replace(/\D/g, "")) || 1,
    title: `Movie ${id}`,
    genres: ["Action"],
    runtime: 100,
    ...overrides,
  };
}

function providerFetcher(providersById) {
  return vi.fn(async (tmdbId) => ({
    providers: providersById[tmdbId] || [],
    region: "US",
    fetchedAt: null,
  }));
}

const ALL_RATINGS = {
  allowedRatings: ["G", "PG", "PG-13", "R", "NC-17"],
  includeUnknown: true,
};

describe("resolveMyMovieEligibility", () => {
  beforeEach(() => {
    clearDrawSelectionCache();
  });

  it("applies ordinary filters without network lookups", async () => {
    const fetchMovieDetails = vi.fn();
    const fetchProviders = vi.fn();
    const movies = [
      movie("m1"),
      movie("m2", { genres: ["Comedy"] }),
      movie("m3", { runtime: 190 }),
    ];

    await expect(resolveMyMovieEligibility({
      remainingMovies: movies,
      myMovieIds: ["m1", "m2", "m3"],
      ratingFilter: ALL_RATINGS,
      genreFilter: { allowedGenres: ["Action"], includeUnknown: false },
      runtimeFilter: { minMinutes: 80, maxMinutes: 120, includeUnknown: false },
      fetchMovieDetails,
      fetchProviders,
    })).resolves.toEqual(["m1"]);

    expect(fetchMovieDetails).not.toHaveBeenCalled();
    expect(fetchProviders).not.toHaveBeenCalled();
  });

  it("stops after owned movies prove the highest-ranked service", async () => {
    const fetchProviders = providerFetcher({
      1: ["Netflix"],
      2: ["Max"],
      3: ["Netflix"],
    });

    const eligibleIds = await resolveMyMovieEligibility({
      remainingMovies: [movie("m1"), movie("m2"), movie("m3")],
      myMovieIds: ["m1", "m2"],
      prioritizeByServices: true,
      prioritizeByServiceRank: true,
      userStreamingServices: ["Netflix", "Max"],
      ratingFilter: ALL_RATINGS,
      fetchProviders,
    });

    expect(eligibleIds).toEqual(["m1"]);
    expect(fetchProviders).toHaveBeenCalledTimes(2);
    expect(fetchProviders).not.toHaveBeenCalledWith(3);
  });

  it("checks outsiders in bounded batches and stops on a higher-ranked match", async () => {
    const movies = [
      movie("m1", { tmdb_id: 101 }),
      ...Array.from({ length: 12 }, (unused, index) =>
        movie(`o${index + 1}`, { tmdb_id: 201 + index })
      ),
    ];
    const fetchProviders = providerFetcher({
      101: ["Max"],
      203: ["Netflix"],
      207: ["Netflix"],
    });

    const eligibleIds = await resolveMyMovieEligibility({
      remainingMovies: movies,
      myMovieIds: ["m1"],
      prioritizeByServices: true,
      prioritizeByServiceRank: true,
      userStreamingServices: ["Netflix", "Max"],
      ratingFilter: ALL_RATINGS,
      fetchProviders,
      batchSize: 3,
    });

    expect(eligibleIds).toEqual([]);
    expect(fetchProviders).toHaveBeenCalledTimes(4);
    expect(fetchProviders).not.toHaveBeenCalledWith(207);
  });

  it("excludes unmatched owned movies as soon as any outsider matches", async () => {
    const fetchProviders = providerFetcher({
      1: ["Paramount+"],
      2: ["Max"],
      3: ["Netflix"],
    });

    await expect(resolveMyMovieEligibility({
      remainingMovies: [movie("m1"), movie("m2"), movie("m3")],
      myMovieIds: ["m1"],
      prioritizeByServices: true,
      prioritizeByServiceRank: false,
      userStreamingServices: ["Netflix", "Max"],
      ratingFilter: ALL_RATINGS,
      fetchProviders,
      batchSize: 1,
    })).resolves.toEqual([]);

    expect(fetchProviders).toHaveBeenCalledTimes(2);
    expect(fetchProviders).not.toHaveBeenCalledWith(3);
  });

  it("keeps ordinary-filtered owned movies when no service matches anywhere", async () => {
    const fetchProviders = providerFetcher({
      1: ["Paramount+"],
      2: ["Peacock"],
    });
    const movies = [
      movie("m1"),
      movie("custom", { tmdb_id: -44 }),
      movie("m2"),
    ];

    await expect(resolveMyMovieEligibility({
      remainingMovies: movies,
      myMovieIds: ["m1", "custom"],
      prioritizeByServices: true,
      userStreamingServices: ["Netflix"],
      ratingFilter: ALL_RATINGS,
      fetchProviders,
    })).resolves.toEqual(["m1", "custom"]);

    expect(fetchProviders).toHaveBeenCalledTimes(2);
    expect(fetchProviders).not.toHaveBeenCalledWith(-44);
  });

  it("keeps every matching owned movie when service ranking is disabled", async () => {
    const fetchProviders = providerFetcher({
      1: ["Netflix"],
      2: ["Max"],
      3: ["Paramount+"],
      4: ["Netflix"],
    });

    await expect(resolveMyMovieEligibility({
      remainingMovies: [movie("m1"), movie("m2"), movie("m3"), movie("m4")],
      myMovieIds: ["m1", "m2", "m3"],
      prioritizeByServices: true,
      prioritizeByServiceRank: false,
      userStreamingServices: ["Netflix", "Max"],
      ratingFilter: ALL_RATINGS,
      fetchProviders,
    })).resolves.toEqual(["m1", "m2"]);

    expect(fetchProviders).toHaveBeenCalledTimes(3);
    expect(fetchProviders).not.toHaveBeenCalledWith(4);
  });

  it("uses one combined metadata lookup per movie when rating and streaming are active", async () => {
    const fetchFilterMetadata = vi.fn(async (tmdbId) => ({
      details: {
        release_dates: {
          results: [{
            iso_3166_1: "US",
            release_dates: [{ certification: tmdbId === 1 ? "PG" : "R" }],
          }],
        },
      },
      providers: tmdbId === 1 ? ["Netflix"] : ["Max"],
      region: "US",
      fetchedAt: null,
    }));
    const fetchMovieDetails = vi.fn();
    const fetchProviders = vi.fn();

    await expect(resolveMyMovieEligibility({
      remainingMovies: [movie("m1"), movie("m2")],
      myMovieIds: ["m1", "m2"],
      prioritizeByServices: true,
      prioritizeByServiceRank: true,
      userStreamingServices: ["Netflix", "Max"],
      ratingFilter: { allowedRatings: ["PG"], includeUnknown: false },
      fetchMovieDetails,
      fetchProviders,
      fetchFilterMetadata,
    })).resolves.toEqual(["m1"]);

    expect(fetchFilterMetadata).toHaveBeenCalledTimes(2);
    expect(fetchMovieDetails).not.toHaveBeenCalled();
    expect(fetchProviders).not.toHaveBeenCalled();
  });
});
