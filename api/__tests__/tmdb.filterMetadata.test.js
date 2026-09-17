import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tmdbFetch: vi.fn(),
}));

vi.mock("../_lib/tmdb.js", () => ({
  tmdbFetch: mocks.tmdbFetch,
}));

import handler from "../tmdb/movie/filter-metadata.js";

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("api/tmdb/movie/filter-metadata", () => {
  beforeEach(() => {
    mocks.tmdbFetch.mockReset();
  });

  it("rejects unsupported methods and invalid ids", async () => {
    const methodRes = createRes();
    await handler({ method: "POST", query: { id: "10" } }, methodRes);
    expect(methodRes.statusCode).toBe(405);

    const idRes = createRes();
    await handler({ method: "GET", query: { id: "custom" } }, idRes);
    expect(idRes.statusCode).toBe(400);
    expect(mocks.tmdbFetch).not.toHaveBeenCalled();
  });

  it("returns details with structured US provider availability", async () => {
    mocks.tmdbFetch.mockResolvedValue({
      id: 77,
      title: "Heat",
      release_dates: { results: [] },
      "watch/providers": {
        results: {
          US: {
            link: "https://www.themoviedb.org/movie/77/watch",
            flatrate: [{ provider_name: "netflix" }, { provider_name: "HBO Max" }],
            ads: [{ provider_name: "hbo max" }, { provider_name: "Tubi" }],
            free: [{ provider_id: 9, provider_name: "Kanopy" }],
            rent: [{ provider_name: "Apple TV" }],
          },
        },
      },
    });

    const res = createRes();
    await handler({ method: "GET", query: { id: "77" } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      details: { id: 77, title: "Heat", release_dates: { results: [] } },
      providers: ["Netflix", "Max", "Kanopy", "Tubi"],
      availability: {
        subscription: [
          expect.objectContaining({ name: "netflix" }),
          expect.objectContaining({ name: "HBO Max" }),
        ],
        free: [expect.objectContaining({ id: 9, name: "Kanopy" })],
        ads: [
          expect.objectContaining({ name: "hbo max" }),
          expect.objectContaining({ name: "Tubi" }),
        ],
        rent: [expect.objectContaining({ name: "Apple TV" })],
        buy: [],
      },
      watchUrl: "https://www.themoviedb.org/movie/77/watch",
      region: "US",
    });
    expect(res.body.details["watch/providers"]).toBeUndefined();
    expect(typeof res.body.fetchedAt).toBe("string");
    expect(mocks.tmdbFetch).toHaveBeenCalledWith(
      "/movie/77?append_to_response=release_dates,watch/providers",
      { signal: undefined }
    );
  });

  it("returns a safe error when TMDB fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.tmdbFetch.mockRejectedValue(Object.assign(new Error("rate limited"), { statusCode: 429 }));

    const res = createRes();
    await handler({ method: "GET", query: { id: "77" } }, res);

    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: "Failed to fetch TMDB filter metadata" });
    expect(errorSpy).toHaveBeenCalled();
  });
});
