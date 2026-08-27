import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDrawSelectionCache,
  getDrawSelection,
  getResolvedDrawPool,
} from "../drawSelection";
import { MPAA_RATING_OPTIONS } from "../movieRatings";

describe("getDrawSelection", () => {
  beforeEach(() => {
    clearDrawSelectionCache();
  });

  it("applies active filters before contributor bucket grouping", async () => {
    const fetchProviders = vi.fn(async () => ({ providers: [], region: "US", fetchedAt: null }));

    const { selected, errorMessage } = await getDrawSelection({
      remainingMovies: [
        { id: "u1-a", tmdb_id: 101, title: "Action A", added_by: "user-1", genres: ["Action"] },
        { id: "u1-b", tmdb_id: 102, title: "Action B", added_by: "user-1", genres: ["Action"] },
        { id: "u2-a", tmdb_id: 201, title: "Comedy A", added_by: "user-2", genres: ["Comedy"] },
      ],
      genreFilter: {
        allowedGenres: ["Comedy"],
        includeUnknown: false,
      },
      fetchProviders,
      fetchMovieDetails: vi.fn(),
      randomFn: () => 0,
    });

    expect(errorMessage).toBeNull();
    expect(selected.movie.id).toBe("u2-a");
    expect(fetchProviders).toHaveBeenCalledWith(201);
  });

  it("resolves the exact post-filter and post-service-rank pool", async () => {
    const movies = [
      { id: "netflix", tmdb_id: 101, genres: ["Action"], runtime: 100 },
      { id: "wrong-genre", tmdb_id: 102, genres: ["Comedy"], runtime: 100 },
      { id: "too-long", tmdb_id: 103, genres: ["Action"], runtime: 220 },
      { id: "max", tmdb_id: 104, genres: ["Action"], runtime: 100 },
      { id: "wrong-rating", tmdb_id: 105, genres: ["Action"], runtime: 100 },
    ];
    const fetchMovieDetails = vi.fn(async (tmdbId) => ({
      release_dates: {
        results: [
          {
            iso_3166_1: "US",
            release_dates: [{ certification: tmdbId === 105 ? "PG" : "R" }],
          },
        ],
      },
    }));
    const fetchProviders = vi.fn(async (tmdbId) => ({
      providers: tmdbId === 104 ? ["Max"] : ["Netflix"],
      region: "US",
      fetchedAt: null,
    }));

    const { candidates, errorMessage } = await getResolvedDrawPool({
      remainingMovies: movies,
      ratingFilter: { allowedRatings: ["R"], includeUnknown: false },
      genreFilter: { allowedGenres: ["Action"], includeUnknown: false },
      runtimeFilter: { minMinutes: 80, maxMinutes: 140, includeUnknown: false },
      prioritizeByServices: true,
      prioritizeByServiceRank: true,
      userStreamingServices: ["Netflix", "Max"],
      fetchMovieDetails,
      fetchProviders,
    });

    expect(errorMessage).toBeNull();
    expect(candidates.map((candidate) => candidate.movie.id)).toEqual(["netflix"]);
    expect(fetchProviders).toHaveBeenCalledTimes(2);
    expect(fetchProviders).toHaveBeenCalledWith(101);
    expect(fetchProviders).toHaveBeenCalledWith(104);
  });

  it("uses combined metadata across whole-bowl rating and provider stages", async () => {
    const fetchFilterMetadata = vi.fn(async (tmdbId) => ({
      details: {
        release_dates: {
          results: [{
            iso_3166_1: "US",
            release_dates: [{ certification: tmdbId === 701 ? "PG" : "R" }],
          }],
        },
      },
      providers: tmdbId === 702 ? ["Netflix"] : ["Max"],
      region: "US",
      fetchedAt: null,
    }));
    const fetchMovieDetails = vi.fn();
    const fetchProviders = vi.fn();

    const { candidates } = await getResolvedDrawPool({
      remainingMovies: [
        { id: "pg", tmdb_id: 701 },
        { id: "netflix-r", tmdb_id: 702 },
        { id: "max-r", tmdb_id: 703 },
      ],
      ratingFilter: { allowedRatings: ["R"], includeUnknown: false },
      prioritizeByServices: true,
      prioritizeByServiceRank: true,
      userStreamingServices: ["Netflix", "Max"],
      fetchMovieDetails,
      fetchProviders,
      fetchFilterMetadata,
    });

    expect(candidates.map((candidate) => candidate.movie.id)).toEqual(["netflix-r"]);
    expect(fetchFilterMetadata).toHaveBeenCalledTimes(3);
    expect(fetchMovieDetails).not.toHaveBeenCalled();
    expect(fetchProviders).not.toHaveBeenCalled();
  });

  it("falls back to separate whole-bowl requests when combined metadata fails", async () => {
    const fetchFilterMetadata = vi.fn(async () => {
      throw new Error("combined route unavailable");
    });
    const fetchMovieDetails = vi.fn(async () => ({
      release_dates: {
        results: [{ iso_3166_1: "US", release_dates: [{ certification: "R" }] }],
      },
    }));
    const fetchProviders = vi.fn(async () => ({
      providers: ["Netflix"],
      region: "US",
      fetchedAt: null,
    }));

    const { candidates } = await getResolvedDrawPool({
      remainingMovies: [{ id: "fallback", tmdb_id: 704 }],
      ratingFilter: { allowedRatings: ["R"], includeUnknown: false },
      prioritizeByServices: true,
      userStreamingServices: ["Netflix"],
      fetchMovieDetails,
      fetchProviders,
      fetchFilterMetadata,
    });

    expect(candidates.map((candidate) => candidate.movie.id)).toEqual(["fallback"]);
    expect(fetchFilterMetadata).toHaveBeenCalledTimes(1);
    expect(fetchMovieDetails).toHaveBeenCalledTimes(1);
    expect(fetchProviders).toHaveBeenCalledTimes(1);
  });

  it("skips rating metadata when the whole rating range and unknowns are allowed", async () => {
    const fetchMovieDetails = vi.fn();
    const fetchFilterMetadata = vi.fn();
    const fetchProviders = vi.fn(async () => ({
      providers: ["Netflix"],
      region: "US",
      fetchedAt: null,
    }));

    const { candidates } = await getResolvedDrawPool({
      remainingMovies: [{ id: "default", tmdb_id: 705 }],
      ratingFilter: { allowedRatings: MPAA_RATING_OPTIONS, includeUnknown: true },
      prioritizeByServices: true,
      userStreamingServices: ["Netflix"],
      fetchMovieDetails,
      fetchProviders,
      fetchFilterMetadata,
    });

    expect(candidates.map((candidate) => candidate.movie.id)).toEqual(["default"]);
    expect(fetchMovieDetails).not.toHaveBeenCalled();
    expect(fetchFilterMetadata).not.toHaveBeenCalled();
    expect(fetchProviders).toHaveBeenCalledTimes(1);
  });
});
