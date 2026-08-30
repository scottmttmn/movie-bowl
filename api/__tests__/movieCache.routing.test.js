import { describe, expect, it, vi } from "vitest";
import vercelConfig from "../../vercel.json";
import handler from "../movie-cache.js";

function response() {
  return {
    setHeader: vi.fn(),
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function rewrittenRequest(path, method) {
  const rewrite = vercelConfig.rewrites.find(({ source }) => source === path);
  expect(rewrite).toBeDefined();
  const destination = new URL(rewrite.destination, "https://moviebowl.app");
  expect(destination.pathname).toBe("/api/movie-cache");
  return {
    method,
    query: Object.fromEntries(destination.searchParams),
    headers: {},
    body: { id: 101, bowlId: "10000000-0000-4000-8000-000000000001" },
  };
}

describe("movie cache public routing", () => {
  for (const path of ["/api/provider-links/lookup", "/api/tmdb/movie/warm-filter-metadata"]) {
    it(`keeps ${path} authenticated after rewriting`, async () => {
      const res = response();
      await handler(rewrittenRequest(path, "POST"), res);
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized" });
    });

    it(`keeps ${path} restricted to POST`, async () => {
      const res = response();
      await handler(rewrittenRequest(path, "GET"), res);
      expect(res.statusCode).toBe(405);
    });
  }

  it.each([["unknown"], [["provider-links", "warm-filter-metadata"]]])("rejects an unknown or ambiguous action", async (action) => {
    const res = response();
    await handler({ query: { action } }, res);
    expect(res.statusCode).toBe(404);
  });
});
