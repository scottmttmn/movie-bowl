import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), from: vi.fn(), fetchTitleDepartures: vi.fn(), tmdbFetch: vi.fn() }));
vi.mock("../_lib/supabaseAdmin.js", () => ({ getSupabaseAdmin: () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("../_lib/titleDepartures.js", () => ({ fetchTitleDepartures: mocks.fetchTitleDepartures }));
vi.mock("../_lib/tmdb.js", () => ({ tmdbFetch: mocks.tmdbFetch }));
import handler from "../_lib/lookupTitleDepartures.js";
const departures = [{ service: "Netflix", expiresOn: "2099-10-31T12:00:00Z" }, { service: "Hulu", expiresOn: null }];
const request = { method: "POST", body: { id: 77 }, headers: { authorization: "Bearer test-token" } };
const response = () => ({ statusCode: 200, setHeader: vi.fn(), status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
let services, providers, metadataDate;
beforeEach(() => {
  vi.stubEnv("MOVIE_OF_THE_NIGHT_API_KEY", "test-key");
  vi.stubEnv("MOVIE_OF_THE_NIGHT_REQUEST_BUDGET", undefined);
  services = ["Netflix"]; providers = ["Netflix"]; metadataDate = new Date().toISOString();
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "user" } } });
  mocks.from.mockReset().mockImplementation((table) => {
    const query = { select: () => query, eq: () => query,
      single: async () => ({ data: { streaming_services: services } }),
      maybeSingle: async () => ({ data: { providers, fetched_at: metadataDate } }) };
    expect(["profiles", "tmdb_filter_metadata"]).toContain(table);
    return query;
  });
  mocks.rpc.mockReset().mockImplementation(async (name) => ({ data: name === "begin_title_departure_fetch"
    ? { should_fetch: true, token: "lease" } : "2099-10-20T12:00:00Z" }));
  mocks.fetchTitleDepartures.mockReset().mockResolvedValue(departures);
  mocks.tmdbFetch.mockReset().mockResolvedValue({ results: { US: { flatrate: [{ provider_name: "Netflix", provider_id: 8 }] } } });
});
afterEach(() => vi.unstubAllEnvs());

describe("departure lookup boundary", () => {
  it.each([[{ ...request, method: "GET" }, 405], [{ ...request, body: { id: true } }, 400],
    [{ ...request, body: { id: -1 } }, 400], [{ ...request, headers: {} }, 401]])("rejects malformed/anonymous requests", async (req, status) => {
    const res = response(); await handler(req, res);
    expect(res.statusCode).toBe(status); expect(mocks.fetchTitleDepartures).not.toHaveBeenCalled();
  });
  it("validates auth before reading profile/cache", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = response(); await handler(request, res);
    expect(res.statusCode).toBe(401); expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each(["no-key", "no-services", "no-match"])("spends no request for %s despite claimed client services", async (reason) => {
    if (reason === "no-key") vi.stubEnv("MOVIE_OF_THE_NIGHT_API_KEY", "");
    if (reason === "no-services") services = [];
    if (reason === "no-match") providers = ["Hulu"];
    const res = response(); await handler({ ...request, body: { id: 77, services: ["Netflix"], providers: ["Netflix"] } }, res);
    expect(res.body).toEqual({ departures: [] }); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rechecks missing/stale TMDB availability and filters results to relevant services", async () => {
    metadataDate = null;
    const res = response(); await handler(request, res);
    expect(mocks.tmdbFetch).toHaveBeenCalledWith("/movie/77/watch/providers", expect.anything());
    expect(res.body.departures).toEqual([departures[0]]);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "begin_title_departure_fetch", { p_tmdb_id: 77, p_user_id: "user", p_budget: 900 });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "complete_title_departure_fetch", { p_tmdb_id: 77, p_token: "lease", p_departures: departures });
  });
  it("shares fresh cached results and obeys lease/budget refusals", async () => {
    mocks.rpc.mockResolvedValue({ data: { should_fetch: false, departures, valid_until: "2099-10-20T12:00:00Z" } });
    const res = response(); await handler(request, res);
    expect(res.body.departures).toEqual([departures[0]]);
    expect(mocks.fetchTitleDepartures).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: { should_fetch: false, departures: [] } });
    await handler(request, response()); expect(mocks.fetchTitleDepartures).not.toHaveBeenCalled();
  });
  it("does not spend if cache reservation is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "42501" } });
    await handler(request, response()); expect(mocks.fetchTitleDepartures).not.toHaveBeenCalled();
  });
  it("fails quietly and establishes backoff without storing upstream text", async () => {
    mocks.fetchTitleDepartures.mockRejectedValue(new Error("private-key-in-upstream-error"));
    const res = response(); await handler(request, res);
    expect(res.body).toEqual({ departures: [] });
    expect(mocks.rpc).toHaveBeenLastCalledWith("fail_title_departure_fetch", { p_tmdb_id: 77, p_token: "lease" });
  });
  it.each(["-1", "901", "oops"])("fails closed with invalid configured budget %s", async (value) => {
    vi.stubEnv("MOVIE_OF_THE_NIGHT_REQUEST_BUDGET", value);
    await handler(request, response());
    expect(mocks.rpc).toHaveBeenCalledWith("begin_title_departure_fetch", expect.objectContaining({ p_budget: 0 }));
  });
});
