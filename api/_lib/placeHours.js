import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { PLACE_ID_PATTERN, TIME_ZONE_PATTERN, UUID_PATTERN, monthlyBudget, readBody } from "./placeDetails.js";

// Opening hours for a restaurant bowl's Open filter, through Google Place
// Details (New). See output/designs/restaurant-bowls.md. One request per
// place, in one batch, each reserved first by begin_place_hours_fetch, which
// also checks the caller can see the bowl and that the bowl holds the place.
// Nothing here is stored: the hours go straight to the filter.

const DETAILS_URL = "https://places.googleapis.com/v1/places/";
const REQUEST_TIMEOUT_MS = 4_000;
export const MAX_PLACES_PER_REQUEST = 40;
// Hours alone: adding a field from the drawn sheet's list would bill this
// request on that sheet's line instead of its own.
const HOURS_FIELDS = [
  "currentOpeningHours.periods",
  "regularOpeningHours.periods",
  "businessStatus",
  "utcOffsetMinutes",
  "timeZone",
].join(",");

function point(value) {
  const day = value?.day;
  const hour = value?.hour ?? 0;
  const minute = value?.minute ?? 0;
  if (!Number.isInteger(day) || day < 0 || day > 6) return null;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { day, hour, minute };
}

function toPeriods(periods) {
  if (!Array.isArray(periods)) return null;
  return periods
    .map((period) => {
      const open = point(period?.open);
      if (!open) return null;
      // A place that never closes has an opening and no closing.
      if (!period.close) return { open, close: null };
      const close = point(period.close);
      return close ? { open, close } : null;
    })
    .filter(Boolean);
}

export function toPlaceHours(body) {
  return {
    closedForGood: body?.businessStatus === "CLOSED_PERMANENTLY",
    // The week ahead, holidays included, when Google has it; else the usual week.
    periods: toPeriods(body?.currentOpeningHours?.periods) ?? toPeriods(body?.regularOpeningHours?.periods),
    utcOffsetMinutes: Number.isInteger(body?.utcOffsetMinutes) ? body.utcOffsetMinutes : null,
    timeZone: TIME_ZONE_PATTERN.test(String(body?.timeZone?.id || "")) ? body.timeZone.id : null,
  };
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
  const bowlId = typeof body.bowlId === "string" ? body.bowlId : "";
  const placeIds = Array.isArray(body.placeIds) ? [...new Set(body.placeIds)] : [];
  if (
    !UUID_PATTERN.test(bowlId) ||
    placeIds.length === 0 ||
    placeIds.length > MAX_PLACES_PER_REQUEST ||
    !placeIds.every((placeId) => typeof placeId === "string" && PLACE_ID_PATTERN.test(placeId))
  ) {
    res.status(400).json({ error: "Invalid places" });
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
    console.error("[api/places/hours] Could not verify the session", error?.message || "");
    res.status(500).json({ error: "Hours are unavailable" });
    return;
  }

  // Without a key nothing is asked, and the filter leaves nothing out.
  const apiKey = env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) {
    res.status(200).json({ hours: {} });
    return;
  }

  let granted;
  try {
    const { data, error } = await admin.rpc("begin_place_hours_fetch", {
      p_user_id: userId,
      p_bowl_id: bowlId,
      p_place_ids: placeIds,
      p_monthly_budget: monthlyBudget(env, "PLACE_HOURS_MONTHLY_BUDGET"),
    });
    if (error) throw Object.assign(new Error("reserve failed"), { code: error.code });
    granted = data;
  } catch (error) {
    console.error("[api/places/hours] Could not reserve requests", error?.code || "");
    res.status(200).json({ hours: {} });
    return;
  }
  if (granted === null || granted === undefined) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Only what was reserved and also asked for: the database's answer is not
  // trusted to stay inside the request.
  const asked = new Set(placeIds);
  const reserved = (Array.isArray(granted) ? granted : []).filter((placeId) => asked.has(placeId));
  const answers = await Promise.all(reserved.map(async (placeId) => {
    try {
      const response = await fetchImpl(`${DETAILS_URL}${encodeURIComponent(placeId)}?languageCode=en`, {
        headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": HOURS_FIELDS },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        // The status only: Google's error body can echo the request.
        console.error("[api/places/hours] Hours failed", response.status);
        return [placeId, null];
      }
      return [placeId, toPlaceHours(await response.json())];
    } catch (error) {
      console.error("[api/places/hours] Hours failed", error?.name || "");
      return [placeId, null];
    }
  }));

  // A place that was asked about and failed is answered as having no hours,
  // so the page holds that and does not spend the month asking again.
  res.status(200).json({ hours: Object.fromEntries(answers) });
}
