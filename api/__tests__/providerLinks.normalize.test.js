import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchProviderLinks, normalizeProviderLinks } from "../_lib/providerLinks.js";

const source = { name: "Netflix", type: "sub", region: "US", web_url: "https://www.netflix.com/title/123" };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Watchmode provider links", () => {
  it("normalizes known services, retains every source type and deduplicates formats", () => {
    expect(normalizeProviderLinks([
      source, { ...source, format: "4K" },
      { ...source, name: "HBO Max", type: "free" },
      { ...source, name: "Amazon", type: "rent" },
      { ...source, name: "AppleTV", type: "buy" },
      { ...source, name: "Hulu", type: "tve" },
      { ...source, region: "CA" }, { ...source, name: "Unknown" }, null,
    ]).map(({ service, type }) => [service, type])).toEqual([
      ["Netflix", "sub"], ["Max", "free"], ["Prime Video", "rent"],
      ["Apple TV+", "buy"], ["Hulu", "tve"],
    ]);
  });

  it("preserves optional native links but rejects executable and credential-bearing URLs", () => {
    const links = normalizeProviderLinks([
      { ...source, ios_url: "nflx://title/123", android_url: "https://www.netflix.com/title/123" },
      { ...source, web_url: "javascript:alert(1)", ios_url: "data:text/html,hi" },
      { ...source, web_url: "https://user:pass@netflix.com/title/123" },
    ]);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ iosUrl: "nflx://title/123", androidUrl: source.web_url });
  });

  it("distinguishes a successful empty response from a malformed response", () => {
    expect(normalizeProviderLinks([])).toEqual([]);
    expect(() => normalizeProviderLinks({ error: "unavailable" })).toThrow();
  });

  it("uses the TMDB sources endpoint with US filtering and a server-only header", async () => {
    vi.stubEnv("WATCHMODE_API_KEY", "test-secret");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [source] });
    vi.stubGlobal("fetch", fetchMock);
    const links = await fetchProviderLinks(329865);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.watchmode.com/v1/title/movie-329865/sources/?regions=US",
      expect.objectContaining({ headers: { "X-API-Key": "test-secret" }, signal: expect.anything() })
    );
    expect(links[0].service).toBe("Netflix");
  });

  it("does not include upstream response bodies in errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(fetchProviderLinks(101)).rejects.toThrow("Watchmode request failed (429)");
  });
});
