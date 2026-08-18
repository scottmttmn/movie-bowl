import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../_lib/supabaseAdmin.js";
import {
  getAppBaseUrl,
  hashDeviceSecret,
  isUuid,
  parseRequestBody,
  sendJson,
} from "../_lib/tvPairing.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const body = parseRequestBody(req);
  const deviceId = String(body.deviceId || "");
  const deviceSecret = String(body.deviceSecret || "");

  if (!isUuid(deviceId) || deviceSecret.length < 40 || deviceSecret.length > 100) {
    sendJson(res, 400, { error: "Invalid TV pairing credentials." });
    return;
  }

  let supabaseAdmin;
  let appBaseUrl;

  try {
    supabaseAdmin = getSupabaseAdmin();
    appBaseUrl = getAppBaseUrl(req);
  } catch (error) {
    console.error("[api/tv-pairing/poll] Missing configuration", error);
    sendJson(res, 500, { error: "TV pairing is not configured." });
    return;
  }

  const deviceSecretHash = hashDeviceSecret(deviceSecret);
  const { data: pairing, error: pairingError } = await supabaseAdmin
    .from("tv_pairing_requests")
    .select("id, approved_by, approved_at, claimed_at, expires_at")
    .eq("id", deviceId)
    .eq("device_secret_hash", deviceSecretHash)
    .maybeSingle();

  if (pairingError) {
    console.error("[api/tv-pairing/poll] Failed to load request", pairingError);
    sendJson(res, 500, { error: "Could not check TV pairing." });
    return;
  }

  if (!pairing) {
    sendJson(res, 404, { error: "TV pairing request not found." });
    return;
  }

  if (new Date(pairing.expires_at).getTime() <= Date.now()) {
    sendJson(res, 410, { error: "TV pairing code expired." });
    return;
  }

  if (!pairing.approved_by || !pairing.approved_at) {
    sendJson(res, 202, { status: "pending", expiresAt: pairing.expires_at });
    return;
  }

  if (pairing.claimed_at) {
    sendJson(res, 409, { error: "TV pairing has already been completed." });
    return;
  }

  // Claim before minting the one-time token so simultaneous polls cannot each
  // receive a valid credential. If minting fails, the exact claim is released.
  const claimMarker = `${new Date().toISOString()}-${randomUUID()}`;
  const claimedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("tv_pairing_requests")
    .update({ claimed_at: claimedAt })
    .eq("id", pairing.id)
    .eq("device_secret_hash", deviceSecretHash)
    .is("claimed_at", null)
    .select("approved_by")
    .maybeSingle();

  if (claimError) {
    console.error("[api/tv-pairing/poll] Failed to claim request", claimError);
    sendJson(res, 500, { error: "Could not complete TV pairing." });
    return;
  }

  if (!claimed) {
    sendJson(res, 409, { error: "TV pairing has already been completed." });
    return;
  }

  try {
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
      claimed.approved_by
    );
    const email = userData?.user?.email;

    if (userError || !email) {
      throw userError || new Error("The approved account has no email address.");
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${appBaseUrl}/tv` },
    });
    const tokenHash = linkData?.properties?.hashed_token;

    if (linkError || !tokenHash) {
      throw linkError || new Error("Supabase did not return a token hash.");
    }

    sendJson(res, 200, {
      status: "approved",
      tokenHash,
      verificationType: "magiclink",
    });
  } catch (error) {
    console.error(`[api/tv-pairing/poll] Failed to mint TV token (${claimMarker})`, error);
    await supabaseAdmin
      .from("tv_pairing_requests")
      .update({ claimed_at: null })
      .eq("id", pairing.id)
      .eq("claimed_at", claimedAt);
    sendJson(res, 500, { error: "Could not complete TV pairing." });
  }
}
