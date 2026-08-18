import { getSupabaseAdmin } from "../_lib/supabaseAdmin.js";
import {
  createDeviceCredentials,
  createUserCode,
  formatUserCode,
  getAppBaseUrl,
  sendJson,
  TV_PAIRING_LIFETIME_MS,
} from "../_lib/tvPairing.js";

const MAX_INSERT_ATTEMPTS = 5;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  let supabaseAdmin;
  let appBaseUrl;

  try {
    supabaseAdmin = getSupabaseAdmin();
    appBaseUrl = getAppBaseUrl(req);
  } catch (error) {
    console.error("[api/tv-pairing/start] Missing configuration", error);
    sendJson(res, 500, { error: "TV pairing is not configured." });
    return;
  }

  const expiresAt = new Date(Date.now() + TV_PAIRING_LIFETIME_MS).toISOString();

  // Pairing records contain no session tokens and can be removed once they are
  // safely past their expiry. Cleanup is opportunistic so no scheduler is needed.
  const { error: cleanupError } = await supabaseAdmin
    .from("tv_pairing_requests")
    .delete()
    .lt("expires_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (cleanupError) {
    console.error("[api/tv-pairing/start] Failed to clean expired requests", cleanupError);
  }

  for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt += 1) {
    const userCode = createUserCode();
    const credentials = createDeviceCredentials();
    const { error } = await supabaseAdmin.from("tv_pairing_requests").insert({
      id: credentials.deviceId,
      user_code: userCode,
      device_secret_hash: credentials.deviceSecretHash,
      expires_at: expiresAt,
    });

    if (!error) {
      const verificationUri = `${appBaseUrl}/activate-tv`;
      const displayCode = formatUserCode(userCode);

      sendJson(res, 201, {
        deviceId: credentials.deviceId,
        deviceSecret: credentials.deviceSecret,
        userCode: displayCode,
        expiresAt,
        verificationUri,
        verificationUriComplete: `${verificationUri}?code=${encodeURIComponent(displayCode)}`,
        pollIntervalSeconds: 2,
      });
      return;
    }

    if (String(error.code || "") !== "23505") {
      console.error("[api/tv-pairing/start] Failed to create pairing request", error);
      sendJson(res, 500, { error: "Could not start TV pairing." });
      return;
    }
  }

  console.error("[api/tv-pairing/start] Exhausted user-code generation attempts");
  sendJson(res, 503, { error: "Could not create a unique TV code. Please try again." });
}
