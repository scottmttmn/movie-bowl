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

  it("returns details with normalized US subscription and ad providers", async () => {
    mocks.tmdbFetch.mockResolvedValue({
      id: 77,
      title: "Heat",
      release_dates: { results: [] },
      "watch/providers": {
        results: {
          US: {
            flatrate: [{ provider_name: "netflix" }, { provider_name: "HBO Max" }],
            ads: [{ provider_name: "hbo max" }, { provider_name: "Tubi" }],
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
      providers: ["Netflix", "Max", "Tubi"],
      region: "US",
    });
    expect(res.body.details["watch/providers"]).toBeUndefined();
    expect(typeof res.body.fetchedAt).toBe("string");
    expect(mocks.tmdbFetch).toHaveBeenCalledWith(
      "/movie/77?append_to_response=release_dates,watch/providers"
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
