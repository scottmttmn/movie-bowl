import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDrawSelectionCache,
  getDrawCandidates,
  isRatingFilterExhaustive,
} from "../drawSelection";
import { MPAA_RATING_OPTIONS } from "../movieRatings";

function ratedDetails(certification) {
  return {
    release_dates: {
      results: [{ iso_3166_1: "US", release_dates: [{ certification }] }],
    },
  };
}

describe("isRatingFilterExhaustive", () => {
  it("treats a missing filter as removing nothing", () => {
    expect(isRatingFilterExhaustive(null)).toBe(true);
  });

  it("is exhaustive when every rating is allowed and unknowns are kept", () => {
    expect(
      isRatingFilterExhaustive({ allowedRatings: MPAA_RATING_OPTIONS, includeUnknown: true })
    ).toBe(true);
  });

  it("is not exhaustive when unknown ratings are excluded", () => {
    expect(
      isRatingFilterExhaustive({ allowedRatings: MPAA_RATING_OPTIONS, includeUnknown: false })
    ).toBe(false);
  });

  it("is not exhaustive when a rating is deselected", () => {
    expect(
      isRatingFilterExhaustive({ allowedRatings: ["G", "PG"], includeUnknown: true })
    ).toBe(false);
  });
});

describe("getDrawCandidates", () => {
  beforeEach(() => {
    clearDrawSelectionCache();
  });

  const movies = [
    { id: "a", tmdb_id: 101, title: "Short Action", genres: ["Action"], runtime: 90 },
    { id: "b", tmdb_id: 102, title: "Long Action", genres: ["Action"], runtime: 200 },
    { id: "c", tmdb_id: 103, title: "Short Comedy", genres: ["Comedy"], runtime: 95 },
  ];

  it("returns only the titles that survive every filter", async () => {
    const { candidates, errorMessage } = await getDrawCandidates({
      remainingMovies: movies,
      genreFilter: { allowedGenres: ["Action"], includeUnknown: false },
      runtimeFilter: { minMinutes: 0, maxMinutes: 120, includeUnknown: false },
      fetchMovieDetails: vi.fn(),
    });

    expect(errorMessage).toBeNull();
    expect(candidates.map((movie) => movie.id)).toEqual(["a"]);
  });

  it("reports the first filter that empties the pool", async () => {
    const fetchMovieDetails = vi.fn(async () => ratedDetails("R"));

    const { candidates, errorMessage } = await getDrawCandidates({
      remainingMovies: movies,
      ratingFilter: { allowedRatings: ["G"], includeUnknown: false },
      genreFilter: { allowedGenres: [], includeUnknown: false },
      fetchMovieDetails,
    });

    expect(candidates).toEqual([]);
    expect(errorMessage).toBe("No titles match your selected ratings. Check your filters.");
  });

  // The pool count has no message to preserve, so it pays for rating lookups
  // only on the titles the free filters could not already rule out.
  it("with ratingLast, only looks up titles that survive the free filters", async () => {
    const fetchMovieDetails = vi.fn(async () => ratedDetails("PG"));

    const { candidates } = await getDrawCandidates({
      remainingMovies: movies,
      ratingFilter: { allowedRatings: ["PG"], includeUnknown: false },
      genreFilter: { allowedGenres: ["Comedy"], includeUnknown: false },
      fetchMovieDetails,
      ratingLast: true,
    });

    expect(candidates.map((movie) => movie.id)).toEqual(["c"]);
    expect(fetchMovieDetails).toHaveBeenCalledTimes(1);
    expect(fetchMovieDetails).toHaveBeenCalledWith(103);
  });

  it("produces the same set whichever order the filters run in", async () => {
    const fetchMovieDetails = vi.fn(async (tmdbId) =>
      ratedDetails(tmdbId === 103 ? "R" : "PG")
    );
    const filters = {
      remainingMovies: movies,
      ratingFilter: { allowedRatings: ["PG"], includeUnknown: false },
      runtimeFilter: { minMinutes: 0, maxMinutes: 120, includeUnknown: false },
      fetchMovieDetails,
    };

    const ratingFirst = await getDrawCandidates(filters);
    const ratingLast = await getDrawCandidates({ ...filters, ratingLast: true });

    expect(ratingFirst.candidates.map((movie) => movie.id)).toEqual(["a"]);
    expect(ratingLast.candidates.map((movie) => movie.id)).toEqual(["a"]);
  });

  it("returns an empty pool without an error when the bowl is empty", async () => {
    const { candidates, errorMessage } = await getDrawCandidates({
      remainingMovies: [],
      genreFilter: { allowedGenres: [], includeUnknown: false },
      fetchMovieDetails: vi.fn(),
    });

    expect(candidates).toEqual([]);
    expect(errorMessage).toBeNull();
  });
});
