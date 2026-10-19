import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  fetchTitleDepartures: vi.fn(),
  tmdbFetch: vi.fn(),
}));
vi.mock("../_lib/supabaseAdmin.js", () => ({
  getSupabaseAdmin: () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("../_lib/titleDepartures.js", () => ({ fetchTitleDepartures: mocks.fetchTitleDepartures }));
vi.mock("../_lib/tmdb.js", () => ({ tmdbFetch: mocks.tmdbFetch }));
import handler from "../_lib/lookupTitleDepartures.js";

const bowlId = "00000000-0000-4000-8000-000000000080";
const validUntil = "2099-10-20T12:00:00Z";
const departures = [
  { service: "Netflix", expiresOn: "2099-10-31T12:00:00Z" },
  { service: "Hulu", expiresOn: null },
];
const request = {
  method: "POST",
  body: { id: 77, bowlId },
  headers: { authorization: "Bearer test-token" },
};
function response() {
  return {
    statusCode: 200,
    setHeader: vi.fn(),
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}
let services, providers, metadataDate, cached, cacheError, logger;
beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("MOVIE_OF_THE_NIGHT_API_KEY", "test-key");
  vi.stubEnv("MOVIE_OF_THE_NIGHT_REQUEST_BUDGET", undefined);
  services = ["Netflix"];
  providers = ["Netflix"];
  metadataDate = new Date().toISOString();
  cached = null;
  cacheError = null;
  logger = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "user" } } });
  mocks.from.mockReset().mockImplementation((table) => {
    const query = {
      select: () => query,
      eq: () => query,
      single: async () => ({ data: { streaming_services: services } }),
      maybeSingle: async () =>
        table === "title_departures"
          ? { data: cached, error: cacheError }
          : { data: { providers, fetched_at: metadataDate } },
    };
    expect(["profiles", "title_departures", "tmdb_filter_metadata"]).toContain(table);
    return query;
  });
  mocks.rpc.mockReset().mockImplementation(async (name) => ({
    data:
      name === "begin_title_departure_fetch" ? { should_fetch: true, token: "lease" } : validUntil,
  }));
  mocks.fetchTitleDepartures.mockReset().mockResolvedValue(departures);
  mocks.tmdbFetch
    .mockReset()
    .mockResolvedValue({
      results: { US: { flatrate: [{ provider_name: "Netflix", provider_id: 8 }] } },
    });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("departure lookup boundary", () => {
  it.each([
    [{ ...request, method: "GET" }, 405],
    [{ ...request, body: { id: true } }, 400],
    [{ ...request, body: { id: -1 } }, 400],
    [{ ...request, body: { id: 77, bowlId: "invalid" } }, 400],
    [{ ...request, headers: {} }, 401],
  ])("rejects malformed/anonymous requests", async (req, status) => {
    const res = response();
    await handler(req, res);
    expect(res.statusCode).toBe(status);
    expect(mocks.fetchTitleDepartures).not.toHaveBeenCalled();
  });
  it("validates auth before reading profile/cache", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = response();
    await handler(request, res);
    expect(res.statusCode).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each(["no-key", "no-services", "no-match", "unsupported-services"])(
    "spends no request for %s despite client claims",
    async (reason) => {
      if (reason === "no-key") vi.stubEnv("MOVIE_OF_THE_NIGHT_API_KEY", "");
      if (reason === "no-services") services = [];
      if (reason === "no-match") providers = ["Hulu"];
      if (reason === "unsupported-services") services = providers = ["Kanopy", "Showtime"];
      const res = response();
      await handler(
        {
          ...request,
          body: { ...request.body, services: ["Netflix"], providers: ["Netflix"], budget: 900 },
        },
        res,
      );
      expect(res.body).toEqual({ departures: [] });
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.fetchTitleDepartures).not.toHaveBeenCalled();
    },
  );
  it.each([null, { departures, valid_until: "2000-01-01" }])(
    "search cannot spend quota on a missing or stale cache",
    async (record) => {
      cached = record;
      metadataDate = null;
      const res = response();
      await handler({ ...request, body: { id: 77 } }, res);
      expect(res.body).toEqual({ departures: [] });
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.tmdbFetch).not.toHaveBeenCalled();
      expect(mocks.fetchTitleDepartures).not.toHaveBeenCalled();
    },
  );
  it("search shares fresh data filtered to the caller without reserving quota", async () => {
    cached = { departures, valid_until: validUntil };
    const res = response();
    await handler({ ...request, body: { id: 77 } }, res);
    expect(res.body).toEqual({ departures: [departures[0]], validUntil });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rechecks stale availability and supplies the authenticated user and bowl for reservation", async () => {
    metadataDate = null;
    const res = response();
    await handler(request, res);
    expect(mocks.tmdbFetch).toHaveBeenCalledWith("/movie/77/watch/providers", expect.anything());
    expect(res.body.departures).toEqual([departures[0]]);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "begin_title_departure_fetch", {
      p_tmdb_id: 77,
      p_bowl_id: bowlId,
      p_user_id: "user",
      p_budget: 900,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "complete_title_departure_fetch", {
      p_tmdb_id: 77,
      p_token: "lease",
      p_departures: departures,
    });
  });
  it("obeys a concurrent cache fill and lease/budget refusals", async () => {
    mocks.rpc.mockResolvedValue({
      data: { should_fetch: false, departures, valid_until: validUntil },
    });
    const res = response();
    await handler(request, res);
    expect(res.body.departures).toEqual([departures[0]]);
    mocks.rpc.mockResolvedValue({ data: { should_fetch: false, departures: [] } });
    await handler(request, response());
    expect(mocks.fetchTitleDepartures).not.toHaveBeenCalled();
  });
  it("does not spend when SQL denies access to the bowl/title", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "42501" } });
    await handler(request, response());
    expect(mocks.fetchTitleDepartures).not.toHaveBeenCalled();
    expect(logger).not.toHaveBeenCalled();
  });
  it("logs missing migrations without exposing database error contents", async () => {
    cacheError = { code: "PGRST205", message: "private-key-in-error" };
    const res = response();
    await handler(request, res);
    expect(res.body).toEqual({ departures: [] });
    expect(logger).toHaveBeenCalledWith("[api/title-departures/lookup] Lookup failed", {
      stage: "cache_read",
      code: "PGRST205",
      status: undefined,
    });
    expect(JSON.stringify(logger.mock.calls)).not.toContain("private-key");
    expect(mocks.fetchTitleDepartures).not.toHaveBeenCalled();
  });
  it.each([401, 429])(
    "logs upstream HTTP %s safely and establishes backoff",
    async (statusCode) => {
      mocks.fetchTitleDepartures.mockRejectedValue(
        Object.assign(new Error("private-key-in-upstream-error"), { statusCode }),
      );
      const res = response();
      await handler(request, res);
      expect(res.body).toEqual({ departures: [] });
      expect(logger).toHaveBeenCalledWith("[api/title-departures/lookup] Lookup failed", {
        stage: "vendor_fetch",
        code: undefined,
        status: statusCode,
      });
      expect(JSON.stringify(logger.mock.calls)).not.toContain("private-key");
      expect(mocks.rpc).toHaveBeenLastCalledWith("fail_title_departure_fetch", {
        p_tmdb_id: 77,
        p_token: "lease",
      });
    },
  );
  it("logs cache writes and failed backoff writes", async () => {
    mocks.rpc.mockImplementation(async (name) =>
      name === "begin_title_departure_fetch"
        ? { data: { should_fetch: true, token: "lease" } }
        : { error: { code: "PGRST202" } },
    );
    await handler(request, response());
    expect(logger.mock.calls.map((call) => call[1].stage)).toEqual([
      "cache_write",
      "backoff_write",
    ]);
  });
  it.each([undefined, "900"])(
    "caps Preview usage at 100 with configured budget %s",
    async (budget) => {
      vi.stubEnv("VERCEL_ENV", "preview");
      vi.stubEnv("MOVIE_OF_THE_NIGHT_REQUEST_BUDGET", budget);
      await handler(request, response());
      expect(mocks.rpc).toHaveBeenCalledWith(
        "begin_title_departure_fetch",
        expect.objectContaining({ p_budget: 100 }),
      );
    },
  );
  it.each(["-1", "901", "oops"])(
    "fails closed with invalid configured budget %s",
    async (value) => {
      vi.stubEnv("MOVIE_OF_THE_NIGHT_REQUEST_BUDGET", value);
      await handler(request, response());
      expect(mocks.rpc).toHaveBeenCalledWith(
        "begin_title_departure_fetch",
        expect.objectContaining({ p_budget: 0 }),
      );
    },
  );
});
