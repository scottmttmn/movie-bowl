import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), fetch: vi.fn() }));
vi.mock("../supabase", () => ({ supabase: { auth: { getSession: mocks.getSession } } }));
import { clearProviderLinksCache, fetchProviderLinks } from "../providerLinks";

const links = [{ service: "Netflix", type: "sub", webUrl: "https://www.netflix.com/title/123" }];
beforeEach(() => {
  clearProviderLinksCache();
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: { user: { id: "u1" }, access_token: "token" } } });
  mocks.fetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({ links }) });
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("provider link client", () => {
  it("deduplicates in-flight work, caches for ten minutes, and then refreshes", async () => {
    vi.useFakeTimers();
    const results = await Promise.all([fetchProviderLinks(101, "bowl"), fetchProviderLinks(101, "bowl")]);
    expect(results).toEqual([{ links }, { links }]);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    await fetchProviderLinks(101, "bowl");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    await fetchProviderLinks(101, "bowl");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenCalledWith("/api/provider-links/lookup", expect.objectContaining({
      method: "POST", body: JSON.stringify({ id: 101, bowlId: "bowl" }),
      headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
    }));
  });

  it("isolates cached links by bowl and account", async () => {
    await fetchProviderLinks(101, "bowl");
    await fetchProviderLinks(101, "other");
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "u2" }, access_token: "token2" } } });
    await fetchProviderLinks(101, "bowl");
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });

  it("never fetches custom titles or unauthenticated requests", async () => {
    expect(await fetchProviderLinks(-1, "bowl")).toEqual({ links: [] });
    expect(await fetchProviderLinks(null, "bowl")).toEqual({ links: [] });
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    expect(await fetchProviderLinks(101, "bowl")).toEqual({ links: [] });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("converts network and HTTP errors to an empty fallback and permits retry", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ok: false });
    expect(await fetchProviderLinks(101, "bowl")).toEqual({ links: [] });
    expect(await fetchProviderLinks(101, "bowl")).toEqual({ links: [] });
    expect(await fetchProviderLinks(101, "bowl")).toEqual({ links });
  });

  it("does not retain links beyond the vendor's 30-day expiration", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ links, fetchedAt: new Date(Date.now() - 31 * 86400000).toISOString() }) });
    expect(await fetchProviderLinks(101, "bowl")).toEqual({ links: [] });
  });

  it("clearing the cache prevents an old in-flight response from re-populating it", async () => {
    let resolve;
    mocks.fetch.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = fetchProviderLinks(101, "bowl");
    await Promise.resolve();
    clearProviderLinksCache();
    resolve({ ok: true, json: async () => ({ links }) });
    await pending;
    await fetchProviderLinks(101, "bowl");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
});
