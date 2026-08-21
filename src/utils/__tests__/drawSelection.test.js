import { describe, expect, it, vi } from "vitest";
import { getDrawSelection, getResolvedDrawPool } from "../drawSelection";

describe("getDrawSelection", () => {
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
});
