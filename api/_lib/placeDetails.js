import { getSupabaseAdmin } from "./supabaseAdmin.js";

// What the drawn restaurant's sheet shows beyond Directions: whether it is
// open, Reserve, Website, Call and one photo, through Google Place Details
// (New). See output/designs/restaurant-bowls.md. Nothing here is stored: the
// answer goes straight to the sheet, and only a count is kept, by
// begin_place_details_fetch, which also checks the caller can see the place.

const DETAILS_URL = "https://places.googleapis.com/v1/places/";
const REQUEST_TIMEOUT_MS = 4_000;
const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHOTO_NAME_PATTERN = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
const PHOTO_WIDTH_PX = 900;
const DETAILS_FIELDS = [
  "currentOpeningHours.openNow",
  "currentOpeningHours.nextOpenTime",
  "currentOpeningHours.nextCloseTime",
  "utcOffsetMinutes",
  "businessStatus",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "googleMapsUri",
  "reservable",
  "photos",
].join(",");

const UNAVAILABLE = Object.freeze({ available: false, details: null, photo: null });

// Google's free monthly allowance is 1,000 of each. A staging project counts
// separately, so it gets a tenth, whatever its variable says.
export function monthlyBudget(env = process.env) {
  const ceiling = env.VERCEL_ENV === "production" ? 900 : 100;
  const value = env.PLACE_DETAILS_MONTHLY_BUDGET;
  if (value === undefined || value === "") return ceiling;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, ceiling) : 0;
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isoTime(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

export function toPlaceDetails(body) {
  const hours = body?.currentOpeningHours;
  const phone = String(body?.internationalPhoneNumber || "").replace(/[^\d+]/g, "");
  return {
    closedForGood: body?.businessStatus === "CLOSED_PERMANENTLY",
    openNow: typeof hours?.openNow === "boolean" ? hours.openNow : null,
    nextOpenTime: isoTime(hours?.nextOpenTime),
    nextCloseTime: isoTime(hours?.nextCloseTime),
    utcOffsetMinutes: Number.isInteger(body?.utcOffsetMinutes) ? body.utcOffsetMinutes : null,
    phone: phone.length >= 5 ? phone : null,
    phoneLabel: String(body?.nationalPhoneNumber || "").trim() || null,
    website: httpsUrl(body?.websiteUri),
    // Google Maps is where its reservation partners take the booking.
    reserveUrl: body?.reservable === true ? httpsUrl(body?.googleMapsUri) : null,
  };
}

export function firstPhoto(body) {
  const photo = Array.isArray(body?.photos) ? body.photos[0] : null;
  if (!photo || !PHOTO_NAME_PATTERN.test(String(photo.name || ""))) return null;
  const author = Array.isArray(photo.authorAttributions) ? photo.authorAttributions[0] : null;
  return {
    name: photo.name,
    author: author?.displayName ? { name: String(author.displayName), uri: httpsUrl(author.uri) } : null,
  };
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

export default async function handler(req, res, { fetchImpl = fetch, admin: injectedAdmin, env = process.env } = {}) {
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
  const placeId = typeof body.placeId === "string" ? body.placeId : "";
  const bowlId = typeof body.bowlId === "string" ? body.bowlId : "";
  const wantsPhoto = body.photo === true;
  if (!PLACE_ID_PATTERN.test(placeId) || !UUID_PATTERN.test(bowlId)) {
    res.status(400).json({ error: "Invalid place" });
    return;
  }

  let admin;
  let userId;
  try {
    admin = injectedAdmin || getSupabaseAdmin();
    const { data, error } = await admin.auth.getUser(token);
    userId = data?.user?.id;
    if (error || !userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  } catch (error) {
    console.error("[api/places/details] Could not verify the session", error?.message || "");
    res.status(500).json({ error: "Details are unavailable" });
    return;
  }

  // Without a key the sheet keeps Directions alone; a fresh checkout's normal state.
  const apiKey = env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) {
    res.status(200).json(UNAVAILABLE);
    return;
  }

  const reserve = async (sku) => {
    const { data, error } = await admin.rpc("begin_place_details_fetch", {
      p_user_id: userId,
      p_bowl_id: bowlId,
      p_place_id: placeId,
      p_sku: sku,
      p_monthly_budget: monthlyBudget(env),
    });
    if (error) throw Object.assign(new Error("reserve failed"), { code: error.code });
    return data;
  };

  let reservation;
  try {
    reservation = await reserve("details");
  } catch (error) {
    console.error("[api/places/details] Could not reserve a request", error?.code || "");
    res.status(200).json(UNAVAILABLE);
    return;
  }
  if (reservation === "denied") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (reservation !== "ok") {
    res.status(200).json(UNAVAILABLE);
    return;
  }

  let details;
  let photoRef = null;
  try {
    const response = await fetchImpl(`${DETAILS_URL}${encodeURIComponent(placeId)}?languageCode=en`, {
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": DETAILS_FIELDS },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      // The status only: Google's error body can echo the request.
      console.error("[api/places/details] Details failed", response.status);
      res.status(200).json(UNAVAILABLE);
      return;
    }
    const answer = await response.json();
    details = toPlaceDetails(answer);
    photoRef = wantsPhoto ? firstPhoto(answer) : null;
  } catch (error) {
    console.error("[api/places/details] Details failed", error?.name || "");
    res.status(200).json(UNAVAILABLE);
    return;
  }

  // The photo is a second request with its own allowance. Its address is
  // short-lived and is handed straight to the sheet, never kept.
  let photo = null;
  if (photoRef) {
    try {
      if ((await reserve("photo")) === "ok") {
        const response = await fetchImpl(
          `https://places.googleapis.com/v1/${photoRef.name}/media?maxWidthPx=${PHOTO_WIDTH_PX}&skipHttpRedirect=true`,
          { headers: { "X-Goog-Api-Key": apiKey }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
        );
        const uri = response.ok ? httpsUrl((await response.json())?.photoUri) : null;
        if (!response.ok) console.error("[api/places/details] Photo failed", response.status);
        if (uri) photo = { uri, author: photoRef.author };
      }
    } catch (error) {
      console.error("[api/places/details] Photo failed", error?.name || error?.code || "");
    }
  }

  res.status(200).json({ available: true, details, photo });
}
