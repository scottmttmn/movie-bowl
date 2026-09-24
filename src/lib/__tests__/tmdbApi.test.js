import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTmdbMovieDetailsCache,
  clearTmdbPersonMoviesCache,
  getTmdbPersonMovies,
  searchTmdbPeople,
  suggestTmdbQuery,
  getTmdbMovieDetails,
  getTmdbMovieFilterMetadata,
  getTmdbMovieProviders,
  searchTmdbMovies,
  warmTmdbMovieFilterMetadata,
} from "../tmdbApi";
import { OFFLINE_MESSAGE } from "../../utils/networkErrors";

describe("tmdbApi", () => {
  beforeEach(() => {
    clearTmdbMovieDetailsCache();
    clearTmdbPersonMoviesCache();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns empty search results for blank queries without fetching", async () => {
    await expect(searchTmdbMovies("   ")).resolves.toEqual({
      page: 1,
      totalPages: 0,
      totalResults: 0,
      results: [],
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("searches TMDB with encoded query strings", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ id: 1, title: "Wall-E" }] }),
    });

    await expect(searchTmdbMovies("Wall-E & Eve", { page: 2 })).resolves.toEqual({
      results: [{ id: 1, title: "Wall-E" }],
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/tmdb/search?query=Wall-E%20%26%20Eve&page=2");
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

  it("requires an id for filter metadata", async () => {
    await expect(getTmdbMovieFilterMetadata("")).rejects.toThrow("Missing movie id");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns empty provider results for blank ids without fetching", async () => {
    await expect(getTmdbMovieProviders("")).resolves.toBeNull();
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
    expect(global.fetch).toHaveBeenNthCalledWith(2, "/api/tmdb/movie/providers?id=77&region=US");
  });

  it("deduplicates and briefly caches repeated movie detail requests", async () => {
    let resolveDetails;
    global.fetch.mockReturnValue(
      new Promise((resolve) => {
        resolveDetails = resolve;
      })
    );

    const first = getTmdbMovieDetails(91);
    const second = getTmdbMovieDetails("91");
    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolveDetails({
      ok: true,
      json: async () => ({ id: 91, title: "Cached Movie", videos: { results: [] } }),
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ id: 91, title: "Cached Movie" }),
      expect.objectContaining({ id: 91, title: "Cached Movie" }),
    ]);
    await expect(getTmdbMovieDetails(91)).resolves.toMatchObject({ id: 91 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("fetches combined filter metadata through the proxy", async () => {
    const metadata = { details: { id: 77 }, providers: ["Netflix"], region: "US" };
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => metadata,
    });

    await expect(getTmdbMovieFilterMetadata("77 ")).resolves.toEqual(metadata);
    expect(global.fetch).toHaveBeenCalledWith("/api/tmdb/movie/filter-metadata?id=77");
  });

  it("warms one added movie without tying it to the add response", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "refreshed" }),
    });

    await expect(warmTmdbMovieFilterMetadata(77, "bowl-1", "access-token"))
      .resolves.toEqual({ status: "refreshed" });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/tmdb/movie/warm-filter-metadata",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer access-token",
        },
        body: JSON.stringify({ id: 77, bowlId: "bowl-1" }),
        keepalive: true,
      }
    );
  });

  it("ranks trailers against the film's own release date and title", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 634,
        title: "Bridget Jones's Diary",
        release_date: "2001-04-13",
        videos: {
          results: [
            { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "2022", name: "Official 2022 Trailer" },
            { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "plain", name: "Official Trailer" },
          ],
        },
      }),
    });

    await expect(getTmdbMovieDetails("634")).resolves.toMatchObject({
      trailer: { key: "plain" },
    });
  });

  it("returns null trailer when no usable YouTube video exists", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 88,
        title: "No Trailer Movie",
        videos: {
          results: [
            { site: "YouTube", type: "Clip", official: true, iso_639_1: "en", key: "clip" },
            { site: "Vimeo", type: "Trailer", official: true, iso_639_1: "en", key: "vimeo" },
          ],
        },
      }),
    });

    await expect(getTmdbMovieDetails("88")).resolves.toMatchObject({
      id: 88,
      trailer: null,
    });
  });

  it("reports a dropped connection instead of a service outage", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    global.fetch.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(searchTmdbMovies("Alien")).rejects.toThrow(OFFLINE_MESSAGE);
  });

  it("keeps the original error when the request reached the server", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    global.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "TMDB is down" }),
    });

    await expect(searchTmdbMovies("Alien")).rejects.toThrow("TMDB is down");
  });

  it("searches people through the search route and finds no one for a blank query", async () => {
    await expect(searchTmdbPeople("  ")).resolves.toEqual({ people: [] });
    expect(global.fetch).not.toHaveBeenCalled();

    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ people: [{ id: 31, name: "Tom Hanks" }] }) });
    await expect(searchTmdbPeople("tom han")).resolves.toEqual({ people: [{ id: 31, name: "Tom Hanks" }] });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/tmdb/search?type=person&query=tom%20han",
      { signal: expect.any(AbortSignal) }
    );
  });

  it("gives up on a slow people search instead of holding up title search", async () => {
    vi.useFakeTimers();
    let requestSignal;
    global.fetch.mockImplementation((url, { signal }) => {
      requestSignal = signal;
      return new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });

    const request = searchTmdbPeople("tom han", { timeoutMs: 100 });
    const outcome = expect(request).rejects.toThrow("Aborted");
    await vi.advanceTimersByTimeAsync(100);
    await outcome;
    expect(requestSignal.aborted).toBe(true);
  });

  it("cancels a people search when the caller does, even before it starts", async () => {
    global.fetch.mockImplementation((url, { signal }) => (
      signal.aborted
        ? Promise.reject(new DOMException("Aborted", "AbortError"))
        : new Promise(() => {})
    ));
    const caller = new AbortController();
    caller.abort();

    await expect(searchTmdbPeople("tom han", { signal: caller.signal })).rejects.toThrow("Aborted");
  });

  it("fetches a person's movies once and serves them again from the cache", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ personId: 31, acting: [{ id: 1, title: "Cast Away" }], directing: [] }),
    });

    const first = await getTmdbPersonMovies("31");
    const second = await getTmdbPersonMovies(31);

    expect(first).toEqual({ acting: [{ id: 1, title: "Cast Away" }], directing: [] });
    expect(second).toEqual(first);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith("/api/tmdb/search?type=person-movies&personId=31");
  });

  it("does not keep a failed person's movies in the cache", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({ error: "Failed to fetch TMDB credits" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ acting: [], directing: [{ id: 2, title: "That Thing You Do!" }] }) });

    await expect(getTmdbPersonMovies(31)).rejects.toThrow("Failed to fetch TMDB credits");
    await expect(getTmdbPersonMovies(31)).resolves.toEqual({
      acting: [],
      directing: [{ id: 2, title: "That Thing You Do!" }],
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("refuses a person id that is not a TMDB id without fetching", async () => {
    await expect(getTmdbPersonMovies("-3")).rejects.toThrow("Invalid person");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("asks the search route for a suggestion, and treats any failure as none", async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ query: "martin scor" }) });
    await expect(suggestTmdbQuery("martin scorcese")).resolves.toBe("martin scor");
    expect(global.fetch).toHaveBeenCalledWith("/api/tmdb/search?type=suggest&query=martin%20scorcese");

    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ query: null }) });
    await expect(suggestTmdbQuery("zqxwvut")).resolves.toBeNull();

    global.fetch.mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({ error: "Failed" }) });
    await expect(suggestTmdbQuery("martin scorcese")).resolves.toBeNull();
  });
});
