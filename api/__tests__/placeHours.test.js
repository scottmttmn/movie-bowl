import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler, { MAX_PLACES_PER_REQUEST, toPlaceHours } from "../_lib/placeHours.js";

const BOWL_ID = "10000000-0000-0000-0000-000000000921";

function response() {
  return {
    setHeader: vi.fn(),
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function request({ body = { placeIds: ["ChIJa", "ChIJb"], bowlId: BOWL_ID }, headers = {}, method = "POST" } = {}) {
  return { method, body, headers: { authorization: "Bearer good-token", ...headers } };
}

function adminWith(granted = ["ChIJa", "ChIJb"], error = null) {
  return {
    auth: {
      getUser: vi.fn(async (token) => (token === "good-token"
        ? { data: { user: { id: "user-1" } }, error: null }
        : { data: null, error: { message: "bad" } })),
    },
    rpc: vi.fn(async () => ({ data: granted, error })),
  };
}

const dinner = {
  currentOpeningHours: {
    periods: [{ open: { day: 6, hour: 17, minute: 0, date: { year: 2026, month: 11, day: 21 } }, close: { day: 6, hour: 21, minute: 30 } }],
  },
  regularOpeningHours: { periods: [{ open: { day: 5, hour: 17, minute: 0 }, close: { day: 5, hour: 21, minute: 0 } }] },
  businessStatus: "OPERATIONAL",
  utcOffsetMinutes: -360,
  timeZone: { id: "America/Chicago" },
};

function google(byPlace = {}) {
  return vi.fn(async (url) => {
    const placeId = decodeURIComponent(String(url).split("/places/")[1].split("?")[0]);
    const answer = byPlace[placeId] ?? dinner;
    return answer === "fail"
      ? { ok: false, status: 500, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => answer };
  });
}

const env = { GOOGLE_PLACES_API_KEY: "places-key", VERCEL_ENV: "production" };

describe("api/places/hours", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("is POST only and signed-in only", async () => {
    const fetchImpl = vi.fn();
    let res = response();
    await handler(request({ method: "GET" }), res, { admin: adminWith(), fetchImpl, env });
    expect(res.statusCode).toBe(405);
    for (const headers of [{ authorization: undefined }, { authorization: "Bearer stolen" }]) {
      res = response();
      await handler(request({ headers }), res, { admin: adminWith(), fetchImpl, env });
      expect(res.statusCode).toBe(401);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a malformed or oversized batch before reserving anything", async () => {
    const admin = adminWith();
    const fetchImpl = vi.fn();
    const tooMany = Array.from({ length: MAX_PLACES_PER_REQUEST + 1 }, (_, index) => `ChIJ${index}`);
    for (const body of [
      { placeIds: [], bowlId: BOWL_ID },
      { placeIds: ["ChIJa"], bowlId: "not-a-bowl" },
      { placeIds: ["bad id/../"], bowlId: BOWL_ID },
      { placeIds: tooMany, bowlId: BOWL_ID },
      { placeIds: "ChIJa", bowlId: BOWL_ID },
    ]) {
      const res = response();
      await handler(request({ body }), res, { admin, fetchImpl, env });
      expect(res.statusCode).toBe(400);
    }
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("asks nothing without a key", async () => {
    const admin = adminWith();
    const fetchImpl = vi.fn();
    const res = response();
    await handler(request(), res, { admin, fetchImpl, env: {} });
    expect(res.body).toEqual({ hours: {} });
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a caller who cannot see the bowl", async () => {
    const fetchImpl = vi.fn();
    const res = response();
    await handler(request(), res, { admin: adminWith(null), fetchImpl, env });
    expect(res.statusCode).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("asks Google only for the places the database reserved, for hours alone", async () => {
    const admin = adminWith(["ChIJa", "ChIJsmuggled"]);
    const fetchImpl = google();
    const res = response();
    await handler(request(), res, { admin, fetchImpl, env });

    expect(admin.rpc).toHaveBeenCalledWith("begin_place_hours_fetch", {
      p_user_id: "user-1",
      p_bowl_id: BOWL_ID,
      p_place_ids: ["ChIJa", "ChIJb"],
      p_monthly_budget: 900,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain("/places/ChIJa?");
    expect(options.headers["X-Goog-FieldMask"]).toBe(
      "currentOpeningHours.periods,regularOpeningHours.periods,businessStatus,utcOffsetMinutes,timeZone"
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      hours: {
        ChIJa: {
          closedForGood: false,
          periods: [{ open: { day: 6, hour: 17, minute: 0 }, close: { day: 6, hour: 21, minute: 30 } }],
          utcOffsetMinutes: -360,
          timeZone: "America/Chicago",
        },
      },
    });
  });

  it("answers a spent month with nothing, and a failed place with no hours", async () => {
    let res = response();
    const unused = vi.fn();
    await handler(request(), res, { admin: adminWith([]), fetchImpl: unused, env });
    expect(res.body).toEqual({ hours: {} });
    expect(unused).not.toHaveBeenCalled();

    res = response();
    await handler(request(), res, { admin: adminWith(), fetchImpl: google({ ChIJb: "fail" }), env });
    expect(res.body.hours.ChIJb).toBeNull();
    expect(res.body.hours.ChIJa.periods).toHaveLength(1);

    res = response();
    await handler(request(), res, { admin: adminWith(null, { code: "XX000" }), fetchImpl: unused, env });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ hours: {} });
  });

  it("uses its own budget variable, capped like the drawn sheet's", async () => {
    const admin = adminWith([]);
    await handler(request(), response(), {
      admin,
      fetchImpl: vi.fn(),
      env: { ...env, VERCEL_ENV: "preview", PLACE_HOURS_MONTHLY_BUDGET: "5000", PLACE_DETAILS_MONTHLY_BUDGET: "7" },
    });
    expect(admin.rpc.mock.calls[0][1].p_monthly_budget).toBe(100);
  });
});

describe("toPlaceHours", () => {
  it("falls back to the usual week, and says so when Google has no hours", () => {
    expect(toPlaceHours({ regularOpeningHours: dinner.regularOpeningHours }).periods).toEqual([
      { open: { day: 5, hour: 17, minute: 0 }, close: { day: 5, hour: 21, minute: 0 } },
    ]);
    expect(toPlaceHours({}).periods).toBeNull();
    expect(toPlaceHours({ businessStatus: "CLOSED_PERMANENTLY" }).closedForGood).toBe(true);
  });

  it("keeps an always-open place and drops a period it cannot read", () => {
    expect(toPlaceHours({
      regularOpeningHours: {
        periods: [
          { open: { day: 0, hour: 0, minute: 0 } },
          { open: { day: 9, hour: 0 }, close: { day: 1, hour: 2 } },
          { open: { day: 1, hour: 11 }, close: { day: 1, hour: 99 } },
        ],
      },
    }).periods).toEqual([{ open: { day: 0, hour: 0, minute: 0 }, close: null }]);
  });
});
