import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ tmdbFetch: vi.fn() }));

vi.mock("../_lib/tmdb.js", () => ({ tmdbFetch: mocks.tmdbFetch }));

import handler from "../tmdb/movie/providers.js";

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

describe("api/tmdb/movie/providers", () => {
  beforeEach(() => mocks.tmdbFetch.mockReset());

  it("validates ids and two-letter regions", async () => {
    const idRes = createRes();
    await handler({ method: "GET", query: { id: "custom" } }, idRes);
    expect(idRes.statusCode).toBe(400);

    const regionRes = createRes();
    await handler({ method: "GET", query: { id: "77", region: "USA" } }, regionRes);
    expect(regionRes.statusCode).toBe(400);
    expect(mocks.tmdbFetch).not.toHaveBeenCalled();
  });

  it("returns only the selected region in the normalized contract", async () => {
    mocks.tmdbFetch.mockResolvedValue({
      results: {
        US: { flatrate: [{ provider_id: 8, provider_name: "Netflix" }] },
        CA: {
          link: "https://www.themoviedb.org/movie/77/watch?locale=CA",
          free: [{ provider_id: 230, provider_name: "CBC Gem" }],
          rent: [{ provider_id: 2, provider_name: "Apple TV" }],
        },
      },
    });

    const res = createRes();
    await handler({ method: "GET", query: { id: "77", region: "ca" } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      region: "CA",
      providers: ["CBC Gem"],
      availability: {
        free: [expect.objectContaining({ id: 230, name: "CBC Gem" })],
        rent: [expect.objectContaining({ id: 2, name: "Apple TV" })],
      },
      watchUrl: "https://www.themoviedb.org/movie/77/watch?locale=CA",
      status: "ready",
    });
    expect(res.body.results).toBeUndefined();
    expect(mocks.tmdbFetch).toHaveBeenCalledWith("/movie/77/watch/providers");
  });
});
