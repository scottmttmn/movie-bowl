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
  for (const [path, authenticationError] of [
    ["/api/account/delete", "Authentication required."],
    ["/api/provider-links/lookup", "Unauthorized"],
    ["/api/tmdb/movie/warm-filter-metadata", "Unauthorized"],
  ]) {
    it(`keeps ${path} authenticated after rewriting`, async () => {
      const res = response();
      await handler(rewrittenRequest(path, "POST"), res);
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: authenticationError });
    });

    it(`keeps ${path} restricted to POST`, async () => {
      const res = response();
      await handler(rewrittenRequest(path, "GET"), res);
      expect(res.statusCode).toBe(405);
    });
  }

  it("keeps /api/starter-packs/candidates signed-in only and GET only after rewriting", async () => {
    const request = rewrittenRequest("/api/starter-packs/candidates", "GET");
    request.query.pack = "spielberg-1980s";
    const res = response();
    await handler(request, res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });

    const posted = response();
    await handler({ ...request, method: "POST" }, posted);
    expect(posted.statusCode).toBe(405);
  });

  it.each([["unknown"], [["account-delete", "provider-links", "warm-filter-metadata"]]])("rejects an unknown or ambiguous action", async (action) => {
    const res = response();
    await handler({ query: { action } }, res);
    expect(res.statusCode).toBe(404);
  });
});
