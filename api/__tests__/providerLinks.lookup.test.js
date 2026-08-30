import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), fetchProviderLinks: vi.fn() }));
vi.mock("../_lib/supabaseAdmin.js", () => ({ getSupabaseAdmin: () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }) }));
vi.mock("../_lib/providerLinks.js", () => ({ fetchProviderLinks: mocks.fetchProviderLinks }));
import handler from "../_lib/lookupProviderLinks.js";

const bowlId = "10000000-0000-4000-8000-000000000001";
const links = [{ service: "Netflix", type: "sub", webUrl: "https://www.netflix.com/title/123" }];
const req = { method: "POST", body: { id: 101, bowlId }, headers: { authorization: "Bearer session-token" } };
function response() {
  return { statusCode: 200, setHeader: vi.fn(), status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
beforeEach(() => {
  vi.stubEnv("WATCHMODE_API_KEY", "test-key");
  vi.stubEnv("PROVIDER_LINKS_ENABLED", "true");
  vi.stubEnv("PROVIDER_LINKS_MONTHLY_BUDGET", undefined);
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "member" } }, error: null });
  mocks.rpc.mockReset().mockResolvedValue({ data: { should_fetch: true, links: [] }, error: null });
  mocks.fetchProviderLinks.mockReset().mockResolvedValue(links);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("provider links lookup", () => {
  it.each([
    [{ ...req, method: "GET" }, 405],
    [{ ...req, body: { id: -3, bowlId } }, 400],
    [{ ...req, body: { id: 1.2, bowlId } }, 400],
    [{ ...req, body: { id: true, bowlId } }, 400],
    [{ ...req, body: { id: 101, bowlId: "bad" } }, 400],
    [{ ...req, headers: {} }, 401],
  ])("rejects malformed or anonymous requests", async (request, code) => {
    const res = response(); await handler(request, res);
    expect(res.statusCode).toBe(code);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.fetchProviderLinks).not.toHaveBeenCalled();
  });

  it("validates the bearer token with Supabase before touching the cache", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    const res = response(); await handler(req, res);
    expect(res.statusCode).toBe(401);
    expect(mocks.getUser).toHaveBeenCalledWith("session-token");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(["disabled", "missing-key"])("falls back without spending when %s", async (reason) => {
    vi.stubEnv(reason === "disabled" ? "PROVIDER_LINKS_ENABLED" : "WATCHMODE_API_KEY", "");
    const res = response(); await handler(req, res);
    expect(res.body).toEqual({ links: [] });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not expose cached links to non-members", async () => {
    mocks.rpc.mockResolvedValue({ data: { links }, error: { code: "42501" } });
    const res = response(); await handler(req, res);
    expect(res.body).toEqual({ links: [] });
    expect(mocks.fetchProviderLinks).not.toHaveBeenCalled();
  });

  it.each([[links], [[]]])("serves cache/budget/backoff results without a vendor call", async (cachedLinks) => {
    mocks.rpc.mockResolvedValue({ data: { should_fetch: false, links: cachedLinks } });
    const res = response(); await handler(req, res);
    expect(res.body.links).toEqual(cachedLinks);
    expect(mocks.fetchProviderLinks).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });

  it("reserves the server-configured budget then completes the fetched result", async () => {
    vi.stubEnv("PROVIDER_LINKS_MONTHLY_BUDGET", "25");
    mocks.rpc.mockResolvedValueOnce({ data: { should_fetch: true } }).mockResolvedValueOnce({ data: "2026-08-30T12:00:00Z" });
    const res = response(); await handler({ ...req, body: { ...req.body, monthlyBudget: 99999 } }, res);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "begin_title_provider_link_fetch", {
      p_tmdb_id: 101, p_region: "US", p_bowl_id: bowlId, p_user_id: "member", p_monthly_budget: 25,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "complete_title_provider_link_fetch", { p_tmdb_id: 101, p_region: "US", p_links: links });
    expect(res.body).toEqual({ links, fetchedAt: "2026-08-30T12:00:00Z" });
  });

  it("fails closed on an invalid budget", async () => {
    vi.stubEnv("PROVIDER_LINKS_MONTHLY_BUDGET", "oops");
    await handler(req, response());
    expect(mocks.rpc).toHaveBeenCalledWith("begin_title_provider_link_fetch", expect.objectContaining({ p_monthly_budget: 0 }));
  });

  it("records 429 backoff and spends nothing on the next refused lookup", async () => {
    mocks.fetchProviderLinks.mockRejectedValue(new Error("Watchmode request failed (429)"));
    const res = response(); await handler(req, res);
    expect(res.body).toEqual({ links: [] });
    expect(mocks.rpc).toHaveBeenLastCalledWith("fail_title_provider_link_fetch", {
      p_tmdb_id: 101, p_region: "US", p_error: "Watchmode request failed (429)",
    });
    mocks.rpc.mockResolvedValue({ data: { should_fetch: false, links: [] } });
    await handler(req, response());
    expect(mocks.fetchProviderLinks).toHaveBeenCalledTimes(1);
  });

  it("sanitizes unexpected upstream errors and tolerates cache write failures", async () => {
    mocks.fetchProviderLinks.mockRejectedValue(new Error("secret in an upstream URL"));
    await handler(req, response());
    expect(mocks.rpc).toHaveBeenLastCalledWith("fail_title_provider_link_fetch", expect.objectContaining({ p_error: "Provider lookup failed" }));
  });
});
