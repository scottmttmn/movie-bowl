import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getTmdbMovieDetails,
  getTmdbMovieProviders,
  searchTmdbMovies,
} from "../tmdbApi";

describe("tmdbApi", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty search results for blank queries without fetching", async () => {
    await expect(searchTmdbMovies("   ")).resolves.toEqual({ results: [] });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("searches TMDB with encoded query strings", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ id: 1, title: "Wall-E" }] }),
    });

    await expect(searchTmdbMovies("Wall-E & Eve")).resolves.toEqual({
      results: [{ id: 1, title: "Wall-E" }],
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/tmdb/search?query=Wall-E%20%26%20Eve");
  });

  it("throws API errors returned by the backend", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "Rate limited" }),
    });

    await expect(searchTmdbMovies("Alien")).rejects.toThrow("Rate limited");
  });

  it("falls back to HTTP status when the error payload is missing", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    });

    await expect(getTmdbMovieProviders(123)).rejects.toThrow("Request failed with 500");
  });

  it("requires an id for movie details", async () => {
    await expect(getTmdbMovieDetails("")).rejects.toThrow("Missing movie id");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns empty provider results for blank ids without fetching", async () => {
    await expect(getTmdbMovieProviders("")).resolves.toEqual({ results: {} });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fetches details and providers using encoded ids", async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 77,
          title: "Heat",
          videos: {
            results: [
              {
                site: "YouTube",
                type: "Trailer",
                official: true,
                iso_639_1: "en",
                key: "heat-trailer",
                name: "Official Trailer",
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: { US: {} } }),
      });

    await expect(getTmdbMovieDetails("77 ")).resolves.toMatchObject({
      id: 77,
      title: "Heat",
      trailer: {
        key: "heat-trailer",
        embedUrl: "https://www.youtube.com/embed/heat-trailer",
      },
    });
    await expect(getTmdbMovieProviders("77 ")).resolves.toEqual({ results: { US: {} } });

    expect(global.fetch).toHaveBeenNthCalledWith(1, "/api/tmdb/movie/details?id=77");
    expect(global.fetch).toHaveBeenNthCalledWith(2, "/api/tmdb/movie/providers?id=77");
  });

  it("returns null trailer when no official YouTube trailer exists", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 88,
        title: "No Trailer Movie",
        videos: {
          results: [{ site: "YouTube", type: "Teaser", official: true, iso_639_1: "en", key: "teaser" }],
        },
      }),
    });

    await expect(getTmdbMovieDetails("88")).resolves.toMatchObject({
      id: 88,
      trailer: null,
    });
  });
});
