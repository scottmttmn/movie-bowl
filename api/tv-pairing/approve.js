import { getSupabaseAdmin } from "../_lib/supabaseAdmin.js";
import {
  getBearerToken,
  normalizeUserCode,
  parseRequestBody,
  sendJson,
  TV_PAIRING_CODE_PATTERN,
} from "../_lib/tvPairing.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const accessToken = getBearerToken(req);
  if (!accessToken) {
    sendJson(res, 401, { error: "Authentication required." });
    return;
  }

  const userCode = normalizeUserCode(parseRequestBody(req).code);
  if (!TV_PAIRING_CODE_PATTERN.test(userCode)) {
    sendJson(res, 400, { error: "Enter the eight-character code shown on the TV." });
    return;
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (error) {
    console.error("[api/tv-pairing/approve] Missing configuration", error);
    sendJson(res, 500, { error: "TV pairing is not configured." });
    return;
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  const user = authData?.user;

  if (authError || !user) {
    sendJson(res, 401, { error: "Authentication required." });
    return;
  }

  const now = new Date().toISOString();
  const { data: approved, error: approveError } = await supabaseAdmin
    .from("tv_pairing_requests")
    .update({ approved_by: user.id, approved_at: now })
    .eq("user_code", userCode)
    .is("approved_by", null)
    .is("claimed_at", null)
    .gt("expires_at", now)
    .select("id, expires_at")
    .maybeSingle();

  if (approveError) {
    console.error("[api/tv-pairing/approve] Failed to approve request", approveError);
    sendJson(res, 500, { error: "Could not connect the TV." });
    return;
  }

  if (approved) {
    sendJson(res, 200, {
      ok: true,
      expiresAt: approved.expires_at,
      user: { email: user.email || "" },
    });
    return;
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("tv_pairing_requests")
    .select("approved_by, claimed_at, expires_at")
    .eq("user_code", userCode)
    .maybeSingle();

  if (existingError) {
    console.error("[api/tv-pairing/approve] Failed to inspect request", existingError);
    sendJson(res, 500, { error: "Could not connect the TV." });
    return;
  }

  if (!existing) {
    sendJson(res, 404, { error: "That TV code was not found." });
    return;
  }

  if (new Date(existing.expires_at).getTime() <= Date.now()) {
    sendJson(res, 410, { error: "That TV code has expired. Request a new one on the TV." });
    return;
  }

  if (existing.approved_by === user.id && !existing.claimed_at) {
    sendJson(res, 200, { ok: true, alreadyApproved: true, user: { email: user.email || "" } });
    return;
  }

  sendJson(res, 409, { error: "That TV code has already been used." });
}
