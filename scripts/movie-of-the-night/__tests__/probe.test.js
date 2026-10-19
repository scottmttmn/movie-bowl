import { describe, expect, it, vi } from "vitest";
import { main, probeMovieOfTheNight, readActiveMovieSample } from "../probe.mjs";

const now = Date.parse("2026-10-19T12:00:00Z");
const apiKey = "private-test-key";
const emptyPage = () => ({ changes: [], shows: {}, hasMore: false });
const response = (body) => ({ ok: true, status: 200, json: async () => body });

describe("Movie of the Night read-only probe", () => {
  it("never exceeds its request allowance across change types", async () => {
    const fetchImpl = vi.fn(async () => response(emptyPage()));
    const report = await probeMovieOfTheNight({ apiKey, fetchImpl, now, maxRequests: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(report.requests).toBe(2);
    expect(report.types.updated.stopped).toBe("request_limit");
    expect(report.types.expiring.stopped).toBe("request_limit");
  });

  it("bounds pagination and labels an incomplete sample", async () => {
    let cursor = 0;
    const fetchImpl = vi.fn(async () => response({ ...emptyPage(), hasMore: true, nextCursor: String(++cursor) }));
    const report = await probeMovieOfTheNight({ apiKey, fetchImpl, now });
    expect(fetchImpl).toHaveBeenCalledTimes(8);
    expect(Object.values(report.types).every((type) => type.stopped === "page_limit")).toBe(true);
  });

  it("can retry only the failed query without re-spending on other types", async () => {
    const fetchImpl = vi.fn(async () => response(emptyPage()));
    const report = await probeMovieOfTheNight({ apiKey, fetchImpl, now, changeTypes: ["removed"] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(Object.keys(report.types)).toEqual(["removed"]);
    expect(fetchImpl.mock.calls[0][0].searchParams.get("change_type")).toBe("removed");
    await expect(probeMovieOfTheNight({ apiKey, changeTypes: ["unsupported"] })).rejects.toThrow("supported");
  });

  it("can narrow an expensive query to specific subscription catalogs", async () => {
    const fetchImpl = vi.fn(async () => response(emptyPage()));
    await probeMovieOfTheNight({
      apiKey, fetchImpl, now, changeTypes: ["removed"],
      catalogs: ["netflix.subscription", "prime.subscription"],
    });
    expect(fetchImpl.mock.calls[0][0].searchParams.get("catalogs"))
      .toBe("netflix.subscription,prime.subscription");
    await expect(probeMovieOfTheNight({ apiKey, catalogs: ["https://another-host.test"] }))
      .rejects.toThrow("catalog identifiers");
  });

  it("stops a repeating cursor instead of spending the remaining allowance", async () => {
    const fetchImpl = vi.fn(async () => response({ ...emptyPage(), hasMore: true, nextCursor: "same" }));
    const report = await probeMovieOfTheNight({ apiKey, fetchImpl, now, pagesPerType: 5 });
    expect(report.types.new.stopped).toBe("repeated_cursor");
    expect(report.types.new.pages).toBe(2);
  });

  it("sends the credential only in a header and refuses redirects", async () => {
    const fetchImpl = vi.fn(async () => response(emptyPage()));
    await probeMovieOfTheNight({ apiKey, fetchImpl, now });
    for (const [url, options] of fetchImpl.mock.calls) {
      expect(String(url)).not.toContain(apiKey);
      expect(url.origin).toBe("https://api.movieofthenight.com");
      expect(options.headers).toEqual({ "X-API-Key": apiKey });
      expect(options.redirect).toBe("error");
    }
    const first = fetchImpl.mock.calls[0][0];
    const future = fetchImpl.mock.calls[3][0];
    expect(Number(first.searchParams.get("from"))).toBe(now / 1000 - 86400);
    expect(Number(future.searchParams.get("from"))).toBe(now / 1000);
  });

  it("counts distinct TMDB movies and bowl matches without printing title data", async () => {
    const change = { showId: "vendor-1", service: { id: "netflix" }, timestamp: 1792400000 };
    const page = {
      changes: [change, change, { showId: "unmapped" }, { showId: "vendor-2", service: { id: "hulu" } }],
      shows: {
        "vendor-1": { tmdbId: "movie/238", title: "Private bowl match" },
        "vendor-2": { tmdbId: "movie/278" },
      },
      hasMore: false,
    };
    const fetchImpl = vi.fn(async () => response(page));
    const report = await probeMovieOfTheNight({ apiKey, fetchImpl, now, activeTmdbIds: new Set([238]) });
    expect(report.uniqueMovies).toBe(2);
    expect(report.matchingActiveMovies).toBe(1);
    expect(report.types.new).toMatchObject({
      duplicateRecords: 1, unmappedRecords: 1, knownDates: 1, unknownDates: 1,
      services: { netflix: 1, hulu: 1 },
    });
    expect(JSON.stringify(report)).not.toContain("Private bowl match");
    expect(JSON.stringify(report)).not.toContain(apiKey);
  });

  it("sanitizes vendor errors and rejects an unusable pagination response", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ message: apiKey }) })
      .mockRejectedValueOnce(new Error(apiKey))
      .mockResolvedValueOnce(response({ ...emptyPage(), hasMore: true }))
      .mockResolvedValueOnce(response(emptyPage()));
    const report = await probeMovieOfTheNight({ apiKey, fetchImpl, now });
    expect(report.types.new.stopped).toBe("http_401");
    expect(report.types.removed.stopped).toBe("request_failed");
    expect(report.types.updated.stopped).toBe("invalid_response");
    expect(JSON.stringify(report)).not.toContain(apiKey);
  });

  it("distinguishes a timeout without exposing the underlying error message", async () => {
    const error = new Error(apiKey);
    error.name = "TimeoutError";
    const report = await probeMovieOfTheNight({
      apiKey, now, changeTypes: ["removed"], fetchImpl: vi.fn(async () => { throw error; }),
    });
    expect(report.types.removed.stopped).toBe("request_timeout");
    expect(JSON.stringify(report)).not.toContain(apiKey);
  });

  it("reads only active movie identifiers and marks the sample cap", async () => {
    const query = {
      select: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      abortSignal: vi.fn(async () => ({ data: Array.from({ length: 1000 }, () => ({ tmdb_id: 238 })), error: null })),
    };
    const client = { from: vi.fn(() => query) };
    const sample = await readActiveMovieSample(client);
    expect(client.from).toHaveBeenCalledWith("bowl_active_tmdb_movies");
    expect(query.select).toHaveBeenCalledWith("tmdb_id");
    expect(query.limit).toHaveBeenCalledWith(1000);
    expect(sample).toEqual({ ids: new Set([238]), rows: 1000, possiblyTruncated: true });
  });

  it("refuses production and a missing key before making vendor calls", async () => {
    await expect(main({ VERCEL_ENV: "production", MOVIE_OF_THE_NIGHT_API_KEY: apiKey })).rejects.toThrow("Preview");
    await expect(main({ VERCEL: "1", MOVIE_OF_THE_NIGHT_API_KEY: apiKey })).rejects.toThrow("Preview");
    await expect(main({ VERCEL_ENV: "production", MOVIE_OF_THE_NIGHT_PROBE_CONTEXT: "preview", MOVIE_OF_THE_NIGHT_API_KEY: apiKey })).rejects.toThrow("Preview");
    await expect(main({ VERCEL_ENV: "preview" })).rejects.toThrow("not configured");
  });
});
