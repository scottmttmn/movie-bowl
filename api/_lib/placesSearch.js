import { getSupabaseAdmin } from "./supabaseAdmin.js";

// Search for a restaurant to add, through Google Places Autocomplete (New).
// See output/designs/restaurant-bowls.md. Only the place id is ever kept: the
// name and street shown here are for choosing, and a slip's name is what the
// adder writes, prefilled from this.

const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const REQUEST_TIMEOUT_MS = 4_000;
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 120;
// Google's own ceiling for a bias circle.
const BIAS_RADIUS_METERS = 50_000;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

// Places carry every type they have, most specific first, so the first one
// that names a cuisine wins: a pizzeria is also an Italian restaurant, and is
// filed as Pizza. Strings match the add sheet's chips (src/utils/restaurants.js,
// which api/ cannot import).
const CUISINE_BY_TYPE = {
  pizza_restaurant: "Pizza",
  mexican_restaurant: "Mexican",
  chinese_restaurant: "Chinese",
  italian_restaurant: "Italian",
  thai_restaurant: "Thai",
  sushi_restaurant: "Sushi",
  indian_restaurant: "Indian",
  barbecue_restaurant: "BBQ",
  mediterranean_restaurant: "Mediterranean",
  greek_restaurant: "Mediterranean",
  lebanese_restaurant: "Mediterranean",
  middle_eastern_restaurant: "Mediterranean",
  turkish_restaurant: "Mediterranean",
  american_restaurant: "American",
  hamburger_restaurant: "American",
  steak_house: "American",
  diner: "American",
  pub: "Pub",
  bar: "Pub",
  wine_bar: "Pub",
  cafe: "Cafe",
  coffee_shop: "Cafe",
  tea_house: "Cafe",
};

// Anything someone might draw to go and eat or drink at. Autocomplete filters
// only on a place's primary type, which would miss an "italian_restaurant"
// asked for as "restaurant", so the request is open and this does the sorting.
const EATING_TYPES = new Set([
  "restaurant", "food", "meal_takeaway", "meal_delivery", "bakery", "bar",
  "cafe", "coffee_shop", "pub", "brewery", "winery", "ice_cream_shop",
  ...Object.keys(CUISINE_BY_TYPE),
]);

export function cuisineFromTypes(types) {
  for (const type of Array.isArray(types) ? types : []) {
    if (CUISINE_BY_TYPE[type]) return CUISINE_BY_TYPE[type];
  }
  return null;
}

// "Water St, Decorah, IA, USA" reads as "Water St, Decorah": enough to tell
// two of the same name apart, short enough for a phone row.
export function shortenAddress(text) {
  const parts = String(text || "").split(",").map((part) => part.trim()).filter(Boolean);
  return parts.slice(0, 2).join(", ");
}

export function toPlaceResults(body) {
  const results = [];
  for (const suggestion of Array.isArray(body?.suggestions) ? body.suggestions : []) {
    const prediction = suggestion?.placePrediction;
    const placeId = typeof prediction?.placeId === "string" ? prediction.placeId : "";
    const name = String(prediction?.structuredFormat?.mainText?.text || "").trim();
    const types = Array.isArray(prediction?.types) ? prediction.types : [];
    if (!placeId || !name || !types.some((type) => EATING_TYPES.has(type))) continue;
    results.push({
      placeId,
      name,
      address: shortenAddress(prediction?.structuredFormat?.secondaryText?.text),
      cuisine: cuisineFromTypes(types),
    });
  }
  return results;
}

// Vercel locates the caller from their own address, which is the only way to
// bias toward where they are without asking for the device's location. Google
// would otherwise bias toward the server, which is nowhere anyone eats.
export function locationBiasFrom(headers = {}) {
  const latitude = Number(headers["x-vercel-ip-latitude"]);
  const longitude = Number(headers["x-vercel-ip-longitude"]);
  if (
    !headers["x-vercel-ip-latitude"] || !headers["x-vercel-ip-longitude"] ||
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180
  ) {
    return null;
  }
  return { circle: { center: { latitude, longitude }, radius: BIAS_RADIUS_METERS } };
}

function readBody(req) {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body || {};
}

export default async function handler(req, res, { fetchImpl = fetch, admin: injectedAdmin } = {}) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = String(req.headers?.authorization || "").match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = readBody(req);
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken : "";
  if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
    res.status(400).json({ error: "Invalid search" });
    return;
  }

  try {
    const admin = injectedAdmin || getSupabaseAdmin();
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user?.id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  } catch (error) {
    console.error("[api/places/search] Could not verify the session", error?.message || "");
    res.status(500).json({ error: "Search is unavailable" });
    return;
  }

  // Without a key the sheet falls back to adding by name; that is a normal
  // state for a fresh checkout, not an error.
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) {
    res.status(200).json({ available: false, results: [] });
    return;
  }

  const request = {
    input: query,
    languageCode: "en",
    ...(SESSION_TOKEN_PATTERN.test(sessionToken) ? { sessionToken } : {}),
  };
  const bias = locationBiasFrom(req.headers);
  if (bias) request.locationBias = bias;

  try {
    const response = await fetchImpl(AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      // The status only: Google's error body can echo the request.
      console.error("[api/places/search] Autocomplete failed", response.status);
      res.status(200).json({ available: false, results: [] });
      return;
    }
    res.status(200).json({ available: true, results: toPlaceResults(await response.json()) });
  } catch (error) {
    console.error("[api/places/search] Autocomplete failed", error?.name || "");
    res.status(200).json({ available: false, results: [] });
  }
}
