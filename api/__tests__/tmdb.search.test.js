import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ tmdbFetch: vi.fn() }));

vi.mock("../_lib/tmdb.js", () => ({ tmdbFetch: mocks.tmdbFetch }));

import handler from "../tmdb/search.js";

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

describe("api/tmdb/search", () => {
  beforeEach(() => mocks.tmdbFetch.mockReset());

  it("validates the query and page", async () => {
    const queryRes = createRes();
    await handler({ method: "GET", query: {} }, queryRes);
    expect(queryRes.statusCode).toBe(400);

    const pageRes = createRes();
    await handler({ method: "GET", query: { query: "Alien", page: "501" } }, pageRes);
    expect(pageRes.statusCode).toBe(400);
    expect(mocks.tmdbFetch).not.toHaveBeenCalled();
  });

  it("returns pagination metadata and defensively excludes adult results", async () => {
    mocks.tmdbFetch.mockResolvedValue({
      page: 2,
      total_pages: 700,
      total_results: 83,
      results: [
        { id: 1, title: "Alien", adult: false },
        { id: 2, title: "Excluded", adult: true },
      ],
    });

    const res = createRes();
    await handler({ method: "GET", query: { query: "Alien & Ripley", page: "2" } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      page: 2,
      totalPages: 500,
      totalResults: 83,
      results: [{ id: 1, title: "Alien", adult: false }],
    });
    expect(mocks.tmdbFetch).toHaveBeenCalledWith(
      "/search/movie?query=Alien%20%26%20Ripley&page=2&language=en-US&region=US&include_adult=false"
    );
  });
});
