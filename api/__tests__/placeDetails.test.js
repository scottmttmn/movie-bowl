import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler, { monthlyBudget, toPlaceDetails } from "../_lib/placeDetails.js";

const BOWL_ID = "10000000-0000-0000-0000-000000000911";

function response() {
  return {
    setHeader: vi.fn(),
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function request({ body = { placeId: "ChIJlarana", bowlId: BOWL_ID }, headers = {}, method = "POST" } = {}) {
  return { method, body, headers: { authorization: "Bearer good-token", ...headers } };
}

function adminWith(reservations = {}) {
  return {
    auth: {
      getUser: vi.fn(async (token) => (token === "good-token"
        ? { data: { user: { id: "user-1" } }, error: null }
        : { data: null, error: { message: "bad" } })),
    },
    rpc: vi.fn(async (_name, args) => ({ data: reservations[args.p_sku] ?? "ok", error: null })),
  };
}

const googleDetails = {
  currentOpeningHours: { openNow: true, nextCloseTime: "2026-11-09T03:00:00Z" },
  utcOffsetMinutes: -360,
  timeZone: { id: "America/Chicago" },
  businessStatus: "OPERATIONAL",
  nationalPhoneNumber: "(563) 555-0101",
  internationalPhoneNumber: "+1 563-555-0101",
  websiteUri: "https://laranabistro.com/",
  googleMapsUri: "https://maps.google.com/?cid=1",
  reservable: true,
};

function google({ details = googleDetails, detailsOk = true } = {}) {
  return vi.fn(async () => ({ ok: detailsOk, status: detailsOk ? 200 : 403, json: async () => details }));
}

const env = { GOOGLE_PLACES_API_KEY: "places-key", VERCEL_ENV: "production" };

describe("api/places/details", () => {
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

  it("refuses a malformed place or bowl", async () => {
    const fetchImpl = vi.fn();
    for (const body of [{ placeId: "bad id!", bowlId: BOWL_ID }, { placeId: "ChIJlarana", bowlId: "nope" }, {}]) {
      const res = response();
      await handler(request({ body }), res, { admin: adminWith(), fetchImpl, env });
      expect(res.statusCode).toBe(400);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("answers unavailable without a key, spending nothing", async () => {
    const admin = adminWith();
    const fetchImpl = vi.fn();
    const res = response();
    await handler(request(), res, { admin, fetchImpl, env: {} });
    expect(res.body).toEqual({ available: false, details: null });
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a place the caller cannot see in that bowl before asking Google", async () => {
    const fetchImpl = vi.fn();
    const res = response();
    await handler(request(), res, { admin: adminWith({ details: "denied" }), fetchImpl, env });
    expect(res.statusCode).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stops at the month's budget", async () => {
    const fetchImpl = vi.fn();
    const res = response();
    await handler(request(), res, { admin: adminWith({ details: "over_budget" }), fetchImpl, env });
    expect(res.body).toEqual({ available: false, details: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns hours and links, reserving one request against the month, and asks for no photo", async () => {
    const admin = adminWith();
    const fetchImpl = google();
    const res = response();
    await handler(request(), res, { admin, fetchImpl, env });

    expect(admin.rpc.mock.calls.map(([name, args]) => [name, args.p_sku, args.p_monthly_budget, args.p_user_id, args.p_bowl_id]))
      .toEqual([["begin_place_details_fetch", "details", 900, "user-1", BOWL_ID]]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [detailsUrl, detailsInit] = fetchImpl.mock.calls[0];
    expect(detailsUrl).toBe("https://places.googleapis.com/v1/places/ChIJlarana?languageCode=en");
    expect(detailsInit.headers["X-Goog-Api-Key"]).toBe("places-key");
    expect(detailsInit.headers["X-Goog-FieldMask"]).toContain("reservable");
    expect(detailsInit.headers["X-Goog-FieldMask"]).not.toContain("photos");
    expect(res.body).toEqual({
      available: true,
      details: {
        closedForGood: false,
        openNow: true,
        nextOpenTime: null,
        nextCloseTime: "2026-11-09T03:00:00Z",
        utcOffsetMinutes: -360,
        timeZone: "America/Chicago",
        phone: "+15635550101",
        phoneLabel: "(563) 555-0101",
        website: "https://laranabistro.com/",
        reserveUrl: "https://maps.google.com/?cid=1",
      }
    });
  });

  it("answers unavailable when Google fails, without logging its body", async () => {
    for (const fetchImpl of [
      vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: { message: "key leaked?" } }) })),
      vi.fn(async () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); }),
    ]) {
      const res = response();
      await handler(request(), res, { admin: adminWith(), fetchImpl, env });
      expect(res.body).toEqual({ available: false, details: null });
    }
    expect(JSON.stringify(console.error.mock.calls)).not.toContain("key leaked");
  });
});

describe("place details helpers", () => {
  it("offers Reserve only where Google says the place takes reservations, and only https links", () => {
    expect(toPlaceDetails({ ...googleDetails, reservable: false }).reserveUrl).toBeNull();
    expect(toPlaceDetails({ websiteUri: "javascript:alert(1)" }).website).toBeNull();
    expect(toPlaceDetails({ businessStatus: "CLOSED_PERMANENTLY" }).closedForGood).toBe(true);
    expect(toPlaceDetails({ timeZone: { id: "<script>" } }).timeZone).toBeNull();
    expect(toPlaceDetails(null)).toMatchObject({ openNow: null, phone: null, website: null, reserveUrl: null });
  });

  it("caps a staging project at a tenth of the allowance", () => {
    expect(monthlyBudget({ VERCEL_ENV: "production" })).toBe(900);
    expect(monthlyBudget({ VERCEL_ENV: "production", PLACE_DETAILS_MONTHLY_BUDGET: "5000" })).toBe(900);
    expect(monthlyBudget({ VERCEL_ENV: "preview", PLACE_DETAILS_MONTHLY_BUDGET: "500" })).toBe(100);
    expect(monthlyBudget({ PLACE_DETAILS_MONTHLY_BUDGET: "nope" })).toBe(0);
  });
});
