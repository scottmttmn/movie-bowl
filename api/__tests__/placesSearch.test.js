import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler, { cuisineFromTypes, locationBiasFrom, shortenAddress, toPlaceResults } from "../_lib/placesSearch.js";

function response() {
  return {
    setHeader: vi.fn(),
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function request({ body = { query: "La Ra", sessionToken: "abcdef1234567890" }, headers = {}, method = "POST" } = {}) {
  return { method, body, headers: { authorization: "Bearer good-token", ...headers } };
}

const admin = {
  auth: {
    getUser: vi.fn(async (token) => (token === "good-token"
      ? { data: { user: { id: "user-1" } }, error: null }
      : { data: null, error: { message: "bad" } })),
  },
};

const prediction = (placeId, mainText, secondaryText, types) => ({
  placePrediction: { placeId, structuredFormat: { mainText: { text: mainText }, secondaryText: { text: secondaryText } }, types },
});

const googleAnswer = {
  suggestions: [
    prediction("ChIJmabes", "Mabe's Pizza", "W Water St, Decorah, IA, USA", ["pizza_restaurant", "italian_restaurant", "restaurant", "food", "establishment"]),
    prediction("ChIJcity", "Madison", "WI, USA", ["locality", "political"]),
    prediction("ChIJlarana", "La Rana Bistro", "Water St, Decorah, IA, USA", ["mediterranean_restaurant", "restaurant", "food"]),
    prediction("ChIJplain", "Plain Diner Co", "Main St, Decorah, IA, USA", ["restaurant", "food"]),
    { queryPrediction: { text: { text: "pizza near me" } } },
  ],
};

describe("api/places/search", () => {
  beforeEach(() => {
    process.env.GOOGLE_PLACES_API_KEY = "places-key";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    vi.restoreAllMocks();
  });

  it("is POST only", async () => {
    const res = response();
    await handler(request({ method: "GET" }), res, { admin });
    expect(res.statusCode).toBe(405);
  });

  it("is signed-in only and never reaches Google without a session", async () => {
    const fetchImpl = vi.fn();
    for (const headers of [{ authorization: undefined }, { authorization: "Bearer stolen" }]) {
      const res = response();
      await handler(request({ headers }), res, { admin, fetchImpl });
      expect(res.statusCode).toBe(401);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a search too short or too long to mean a place", async () => {
    const fetchImpl = vi.fn();
    for (const query of ["", " a ", "x".repeat(121), 42]) {
      const res = response();
      await handler(request({ body: { query } }), res, { admin, fetchImpl });
      expect(res.statusCode).toBe(400);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("answers unavailable without a key, so the sheet adds by name", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const fetchImpl = vi.fn();
    const res = response();
    await handler(request(), res, { admin, fetchImpl });
    expect(res.body).toEqual({ available: false, results: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("asks Google once, near the caller, and returns only places to eat", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => googleAnswer }));
    const res = response();
    await handler(request({ headers: { "x-vercel-ip-latitude": "43.30", "x-vercel-ip-longitude": "-91.79" } }), res, { admin, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:autocomplete");
    expect(init.headers["X-Goog-Api-Key"]).toBe("places-key");
    expect(init.headers["X-Goog-FieldMask"]).toContain("suggestions.placePrediction.placeId");
    expect(JSON.parse(init.body)).toEqual({
      input: "La Ra",
      languageCode: "en",
      sessionToken: "abcdef1234567890",
      locationBias: { circle: { center: { latitude: 43.3, longitude: -91.79 }, radius: 50000 } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      available: true,
      results: [
        { placeId: "ChIJmabes", name: "Mabe's Pizza", address: "W Water St, Decorah", cuisine: "Pizza" },
        { placeId: "ChIJlarana", name: "La Rana Bistro", address: "Water St, Decorah", cuisine: "Mediterranean" },
        { placeId: "ChIJplain", name: "Plain Diner Co", address: "Main St, Decorah", cuisine: null },
      ],
    });
  });

  it("leaves out a malformed session token rather than sending it", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ suggestions: [] }) }));
    await handler(request({ body: { query: "Mabe", sessionToken: "not a token!" } }), response(), { admin, fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).not.toHaveProperty("sessionToken");
  });

  it("answers unavailable when Google fails, without logging its body", async () => {
    for (const fetchImpl of [
      vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: { message: "key leaked?" } }) })),
      vi.fn(async () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); }),
    ]) {
      const res = response();
      await handler(request(), res, { admin, fetchImpl });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ available: false, results: [] });
    }
    expect(JSON.stringify(console.error.mock.calls)).not.toContain("key leaked");
  });
});

describe("places search helpers", () => {
  it("files a place under its most specific cuisine", () => {
    expect(cuisineFromTypes(["pizza_restaurant", "italian_restaurant"])).toBe("Pizza");
    expect(cuisineFromTypes(["coffee_shop", "cafe", "food"])).toBe("Cafe");
    expect(cuisineFromTypes(["restaurant", "food"])).toBeNull();
    expect(cuisineFromTypes(undefined)).toBeNull();
  });

  it("keeps the street and town", () => {
    expect(shortenAddress("Water St, Decorah, IA, USA")).toBe("Water St, Decorah");
    expect(shortenAddress("")).toBe("");
  });

  it("biases only toward a real location", () => {
    expect(locationBiasFrom({})).toBeNull();
    expect(locationBiasFrom({ "x-vercel-ip-latitude": "abc", "x-vercel-ip-longitude": "1" })).toBeNull();
    expect(locationBiasFrom({ "x-vercel-ip-latitude": "95", "x-vercel-ip-longitude": "1" })).toBeNull();
  });

  it("ignores suggestions without an id or a name", () => {
    expect(toPlaceResults({ suggestions: [prediction("", "Nameless", "", ["restaurant"]), prediction("id", "", "", ["restaurant"])] })).toEqual([]);
    expect(toPlaceResults(null)).toEqual([]);
  });
});
